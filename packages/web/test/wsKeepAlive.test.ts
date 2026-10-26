import { describe, expect, it, vi } from "vitest";
import { startWsKeepAlive, type WsKeepAliveScheduler } from "../src/webSocketKeepAlive.js";

function createManualScheduler() {
  const intervalHandlers: Array<() => void> = [];
  const timeouts: Array<{ id: number; handler: () => void }> = [];
  let nextTimeoutId = 1;
  const scheduler: WsKeepAliveScheduler = {
    setInterval: (handler) => {
      intervalHandlers.push(handler);
      return intervalHandlers.length - 1;
    },
    setTimeout: (handler, ms) => {
      const id = nextTimeoutId++;
      timeouts.push({ id, handler });
      return { id, ms };
    },
    clearTimeout: (handle) => {
      const { id } = handle as { id: number };
      const index = timeouts.findIndex((entry) => entry.id === id);
      if (index >= 0) timeouts.splice(index, 1);
    },
  };
  return {
    scheduler,
    tick: () => {
      const handler = intervalHandlers[intervalHandlers.length - 1];
      if (!handler) throw new Error("no interval scheduled");
      handler();
    },
    fireTimeouts: () => {
      for (const entry of [...timeouts]) entry.handler();
    },
    pendingTimeouts: () => timeouts.length,
  };
}

describe("startWsKeepAlive", () => {
  it("recovers once when a ping times out and ignores later ticks", () => {
    const { scheduler, tick, fireTimeouts, pendingTimeouts } = createManualScheduler();
    const recover = vi.fn();
    // 永不 resolve 的 ping：模拟写入半开连接（数据进黑洞）。
    const sendPing = () => new Promise(() => {});
    startWsKeepAlive({ sendPing, recover, scheduler });

    tick();
    expect(pendingTimeouts()).toBe(1);
    fireTimeouts();
    expect(recover).toHaveBeenCalledWith("ping-timeout");

    // 已恢复后：后续周期与残留超时不再触发第二次恢复。
    tick();
    fireTimeouts();
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("clears the timeout when the ping resolves", () => {
    const { scheduler, tick, fireTimeouts, pendingTimeouts } = createManualScheduler();
    const recover = vi.fn();
    let resolvePing: (value: unknown) => void = () => {};
    startWsKeepAlive(
      {
        sendPing: () =>
          new Promise((resolve) => {
            resolvePing = resolve;
          }),
        recover,
        scheduler,
      },
    );
    tick();
    resolvePing(undefined);
    // 微任务落地后超时句柄应被清除，不会误判死亡。
    return Promise.resolve().then(() => {
      fireTimeouts();
      expect(recover).not.toHaveBeenCalled();
      expect(pendingTimeouts()).toBe(0);
    });
  });

  it("recovers on ping rejection", () => {
    const { scheduler, tick } = createManualScheduler();
    const recover = vi.fn();
    startWsKeepAlive({
      sendPing: () => Promise.reject(new Error("socket write failed")),
      recover,
      scheduler,
    });
    tick();
    // reject 微任务落地后触发恢复。
    return Promise.resolve().then(() => {
      expect(recover).toHaveBeenCalledWith("ping-error");
    });
  });

  it("recovers exactly once when the socket closes", () => {
    const { scheduler } = createManualScheduler();
    const recover = vi.fn();
    const handle = startWsKeepAlive({ sendPing: () => Promise.resolve(), recover, scheduler });
    handle.notifySocketClosed();
    handle.notifySocketClosed();
    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith("socket-closed");
  });

  it("does not recover after dispose", () => {
    const { scheduler } = createManualScheduler();
    const recover = vi.fn();
    const handle = startWsKeepAlive({ sendPing: () => Promise.resolve(), recover, scheduler });
    handle.dispose();
    handle.notifySocketClosed();
    expect(recover).not.toHaveBeenCalled();
  });

  it("skips a tick while the previous ping is still in flight", () => {
    const { scheduler, tick, pendingTimeouts } = createManualScheduler();
    const recover = vi.fn();
    const sendPing = vi.fn(() => new Promise(() => {}));
    startWsKeepAlive({ sendPing, recover, scheduler });

    tick();
    tick();
    // 第二个周期被跳过：仍只有一次在途探测与一个超时句柄。
    expect(sendPing).toHaveBeenCalledTimes(1);
    expect(pendingTimeouts()).toBe(1);
  });
});
