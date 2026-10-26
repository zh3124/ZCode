/**
 * zcode --web 浏览器直连链路的看门狗。
 *
 * /ws 使用 SocketProtocol（纯分帧，无心跳/ACK）：反向代理按空闲掐断连接
 * （nginx 类默认 60s）时浏览器毫无感知，后续 RPC 写入死连接被静默丢弃，
 * 挂起的请求永不返回（界面表现为一直转圈，刷新页面才能恢复）。
 *
 * 看门狗做两件事：
 * 1. 预防——周期性发送廉价请求，任何方向的流量都会重置代理的空闲计时器；
 * 2. 兜底——超时无响应或收到 close 事件时执行恢复动作（整页 reload：
 *    服务端持有全部会话状态，浏览器重建连接即完全恢复，避免手工重接
 *    服务树造成的状态撕裂）。
 */

export interface WsKeepAliveOptions {
  /** 发起一次探测请求；resolve 即视为连接存活，reject/超时视为疑似死亡。 */
  sendPing: () => Promise<unknown>;
  /** 连接判定死亡后的恢复动作（如 location.reload()）。 */
  recover: (reason: WsKeepAliveRecoverReason) => void;
  /** 探测间隔，需显著小于常见代理的空闲超时（默认 60s）。默认 25s。 */
  intervalMs?: number;
  /** 单次探测的超时；超时视为死亡。默认 10s。 */
  timeoutMs?: number;
  /** 测试注入的定时器实现。 */
  scheduler?: WsKeepAliveScheduler;
}

export type WsKeepAliveRecoverReason = "ping-timeout" | "ping-error" | "socket-closed";

export interface WsKeepAliveScheduler {
  setInterval(handler: () => void, ms: number): unknown;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultScheduler: WsKeepAliveScheduler = {
  setInterval: (handler, ms) => setInterval(handler, ms),
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface WsKeepAliveHandle {
  /** socket close/error 事件入口：立即触发恢复（同样只触发一次）。 */
  notifySocketClosed(): void;
  dispose(): void;
}

export function startWsKeepAlive(options: WsKeepAliveOptions): WsKeepAliveHandle {
  const intervalMs = options.intervalMs ?? 25_000;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const scheduler = options.scheduler ?? defaultScheduler;
  // 恢复动作只执行一次：reload 触发后的残留定时器不应再次触发。
  let recovered = false;
  let disposed = false;
  let pingInFlight = false;

  const recover = (reason: WsKeepAliveRecoverReason) => {
    if (recovered || disposed) return;
    recovered = true;
    options.recover(reason);
  };

  const tick = () => {
    if (recovered || disposed || pingInFlight) return;
    pingInFlight = true;
    const timeoutHandle = scheduler.setTimeout(() => {
      pingInFlight = false;
      recover("ping-timeout");
    }, timeoutMs);
    let settled = false;
    Promise.resolve(options.sendPing())
      .then(
        () => {
          if (settled) return;
          settled = true;
          pingInFlight = false;
          scheduler.clearTimeout(timeoutHandle);
        },
        () => {
          if (settled) return;
          settled = true;
          pingInFlight = false;
          scheduler.clearTimeout(timeoutHandle);
          // 探测请求本身报错通常意味着底层 socket 已关（写失败/连接重置），
          // 与超时同等处理；业务 4xx/5xx 走 RPC 层不会 reject 这里（见调用方）。
          recover("ping-error");
        },
      )
      .catch(() => {
        /* then 分支内部不会再抛；防御性吞掉，保持 tick 周期稳定 */
      });
  };

  const intervalHandle = scheduler.setInterval(tick, intervalMs);

  return {
    notifySocketClosed() {
      recover("socket-closed");
    },
    dispose() {
      disposed = true;
    },
  };
}
