import { useEffect, useMemo, useState } from "react";
import type { VirtualProject } from "@zcode/services";
import type { WorkspaceTabState } from "@/store/tabStore.js";
import { isSelfServerHost, useBaseWorkspaceServices, useSelfServerHostId } from "@/hooks/useWorkspaceServices.js";
import { logger } from "@/logger.js";

export interface AutomationProjectOption {
  projectId: string;
  hostId: string;
  workspacePath: string;
  label: string;
}

export function isRemoteAutomationWorkspace(tab: WorkspaceTabState | undefined): boolean {
  return Boolean(tab?.remoteSessionId || tab?.remoteTarget || tab?.workspaceIdentity);
}

export function resolveAutomationProjectOptions(
  projects: readonly VirtualProject[],
  selfServerHostId?: string | null,
): AutomationProjectOption[] {
  return projects
    .filter(
      // zcode --web 直连下所有项目都以 Source Server 自身身份落库
      // （remote:server:<id>），与 local 同样是本机可执行自动化的目标；
      // 只按 "local" 过滤会把项目选项清空（定时任务无法选择项目）。
      (project) =>
        !project.deleted && isSelfServerHost(project.hostId, selfServerHostId ?? null),
    )
    .map((project) => ({
      projectId: project.id,
      hostId: project.hostId,
      workspacePath: project.roots.find((root) => root.isPrimary)?.rootPath ?? "",
      label: project.name,
    }));
}

/** 定义选择 Host 的虚拟项目；空项目在提交时初始化目录，不随打开的 tab 增减。 */
export function useAutomationProjectOptions(): AutomationProjectOption[] {
  const services = useBaseWorkspaceServices();
  const selfServerHostId = useSelfServerHostId();
  const [projects, setProjects] = useState<VirtualProject[]>([]);
  useEffect(() => {
    let generation = 0;
    const refresh = async () => {
      const request = ++generation;
      try {
        if (!services.projectService) throw new Error("project.service-unavailable");
        const projects = await services.projectService.readProjects();
        if (request === generation) setProjects(projects);
      } catch (error) {
        if (request !== generation) return;
        setProjects([]);
        logger.error("[automation-projects] 读取项目选项失败", error);
      }
    };
    void refresh();
    const subscription = services.broadcastService.onMessage((event) => {
      if (event.channel === "state:projects") void refresh();
    });
    return () => {
      generation++;
      subscription.dispose();
    };
  }, [services]);
  return useMemo(
    () => resolveAutomationProjectOptions(projects, selfServerHostId),
    [projects, selfServerHostId],
  );
}
