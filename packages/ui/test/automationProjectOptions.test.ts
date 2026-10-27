// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VirtualProject } from "@zcode/services";
import {
  resolveAutomationProjectOptions,
  useAutomationProjectOptions,
} from "@/hooks/useAutomationProjectOptions.js";
const service = vi.hoisted(() => ({
  readProjects: vi.fn(),
  readTree: vi.fn(async () => {
    throw new Error("task query forbidden");
  }),
  onMessage: () => ({ dispose() {} }),
}));
vi.mock("@/hooks/useWorkspaceServices.js", async (importOriginal) => ({
  // 纯判定函数用真实实现；仅 mock 服务 hook。
  ...(await importOriginal<typeof import("@/hooks/useWorkspaceServices.js")>()),
  useBaseWorkspaceServices: () => services,
  // 默认非 web 直连（桌面/远控），自身服务器身份为 null。
  useSelfServerHostId: () => null,
}));
const services = { projectService: service, broadcastService: { onMessage: service.onMessage } };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const project = (
  id: string,
  roots: string[] = [],
  extra: Partial<VirtualProject> = {},
): VirtualProject => ({
  id,
  hostId: "local",
  name: id,
  roots: roots.map((rootPath, position) => ({ rootPath, position, isPrimary: position === 0 })),
  deleted: false,
  pinned: false,
  nameOverridden: true,
  position: 0,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
describe("automation virtual project options", () => {
  it("opening the project selector reads directories without querying tasks or auto-archiving", async () => {
    service.readProjects.mockResolvedValue([project("p", ["/unopened"])]);
    const { result } = renderHook(useAutomationProjectOptions);
    await waitFor(() => expect(result.current.map((option) => option.projectId)).toEqual(["p"]));
    expect(service.readProjects).toHaveBeenCalledOnce();
    expect(service.readTree).not.toHaveBeenCalled();
  });
  it("keeps empty projects and overlapping roots as distinct choices without open tabs", () => {
    expect(
      resolveAutomationProjectOptions([
        project("empty"),
        project("a", ["/same", "/extra"]),
        project("b", ["/same"]),
      ]),
    ).toEqual([
      { projectId: "empty", hostId: "local", workspacePath: "", label: "empty" },
      { projectId: "a", hostId: "local", workspacePath: "/same", label: "a" },
      { projectId: "b", hostId: "local", workspacePath: "/same", label: "b" },
    ]);
  });
  it("excludes deleted projects and remote entries from local scheduling", () => {
    expect(
      resolveAutomationProjectOptions([
        project("deleted", [], { deleted: true }),
        project("remote", [], { hostId: "remote:server:s" }),
      ]),
    ).toEqual([]);
  });

  it("includes the source server's own projects in zcode --web direct mode", () => {
    const self = "remote:server:zh-vm";
    // web 直连下所有项目都以服务器自身身份落库；不识别会把定时任务的项目
    // 选项清空（hostId === "local" 过滤无一命中）。
    expect(
      resolveAutomationProjectOptions(
        [
          project("self", ["/srv/app"], { hostId: self }),
          project("self-deleted", [], { hostId: self, deleted: true }),
          project("other-remote", [], { hostId: "remote:server:other" }),
          project("local", ["/home/dev/p"], {}),
        ],
        self,
      ),
    ).toEqual([
      { projectId: "self", hostId: self, workspacePath: "/srv/app", label: "self" },
      { projectId: "local", hostId: "local", workspacePath: "/home/dev/p", label: "local" },
    ]);
  });
});
