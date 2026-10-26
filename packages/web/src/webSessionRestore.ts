/**
 * zcode --web 断线恢复的会话位置记忆。
 *
 * 看门狗（webSocketKeepAlive）判定连接死亡后整页 reload，但 reload 本身不
 * 记得用户当时所在的会话页——boot 后回到主页。本模块在恢复前把「当前正在
 * 查看的会话」（workbench store 的 active context，V4 会话视图的唯一事实）
 * 持久化到 sessionStorage，下次 boot 成功连接后消费并回到该会话。
 *
 * 一次性语义：只有 persistForReload() 写入的记录才会被消费（即仅看门狗
 * 触发的恢复会还原位置）；普通手动刷新不消费、回到主页，行为保持可预期。
 * 消费发生在 WebSocket 连接成功之后：恢复期服务端短暂不可用时（boot 失败
 * 渲染失败页或浏览器错误页）记录不被消耗，服务恢复后的首次成功 boot 仍能
 * 还原。
 */

const STORAGE_KEY = "zcode:web:session-restore";

export interface WebSessionRestoreView {
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
}

/** 看门狗触发 reload 前调用：把当前查看的会话落入 sessionStorage；无会话时不写。 */
export function persistForReload(
  view: WebSessionRestoreView | null,
  storage: Storage | null = safeStorage(),
): void {
  if (!storage || !view) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // 隐私模式/配额限制下静默放弃：恢复到主页是可接受的降级。
  }
}

/**
 * boot 成功建立连接后调用：消费恢复记录（读后即清）。
 * 无记录（普通刷新/首次访问）返回 null。
 */
export function consumeRestoredView(storage: Storage | null = safeStorage()): WebSessionRestoreView | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    storage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<WebSessionRestoreView>;
    if (typeof parsed.taskId !== "string" || typeof parsed.workspacePath !== "string") {
      return null;
    }
    return {
      taskId: parsed.taskId,
      workspacePath: parsed.workspacePath,
      ...(typeof parsed.workspaceIdentity === "string" ? { workspaceIdentity: parsed.workspaceIdentity } : {}),
    };
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}
