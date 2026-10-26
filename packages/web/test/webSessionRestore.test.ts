import { describe, expect, it, beforeEach } from "vitest";
import {
  consumeRestoredView,
  persistForReload,
  type WebSessionRestoreView,
} from "../src/webSessionRestore.js";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

const VIEW: WebSessionRestoreView = {
  taskId: "task-9",
  workspacePath: "/home/zh/codespace/ZCode",
  workspaceIdentity: "remote:server:zh-vm:/home/zh/codespace/ZCode",
};

describe("webSessionRestore", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("returns null when nothing was persisted (normal refresh stays home)", () => {
    expect(consumeRestoredView(storage)).toBeNull();
  });

  it("does not persist when no conversation is active (draft/home view)", () => {
    persistForReload(null, storage);
    expect(storage.getItem("zcode:web:session-restore")).toBeNull();
  });

  it("round-trips the active conversation across persist and consume", () => {
    persistForReload(VIEW, storage);
    expect(consumeRestoredView(storage)).toEqual(VIEW);
  });

  it("round-trips without optional workspaceIdentity", () => {
    persistForReload({ taskId: "t1", workspacePath: "/w" }, storage);
    expect(consumeRestoredView(storage)).toEqual({ taskId: "t1", workspacePath: "/w" });
  });

  it("consumes exactly once (read clears the record)", () => {
    persistForReload(VIEW, storage);
    expect(consumeRestoredView(storage)).not.toBeNull();
    expect(consumeRestoredView(storage)).toBeNull();
  });

  it("keeps the record when boot never reached consume (server briefly down)", () => {
    persistForReload(VIEW, storage);
    // 模拟 boot 失败（浏览器错误页/失败页）：没有任何 consume 调用，记录保留。
    expect(storage.getItem("zcode:web:session-restore")).not.toBeNull();
    expect(consumeRestoredView(storage)).toEqual(VIEW);
  });

  it("drops malformed records instead of throwing", () => {
    storage.setItem("zcode:web:session-restore", "{not json");
    expect(consumeRestoredView(storage)).toBeNull();
    storage.setItem("zcode:web:session-restore", JSON.stringify({ taskId: 1 }));
    expect(consumeRestoredView(storage)).toBeNull();
  });
});
