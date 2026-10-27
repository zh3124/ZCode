# zcode --web 已知限制：定时任务（automations）无调度器执行

> 状态：已确认的缺陷，暂不修复（2026-10-27 决定）。本文记录根因与证据，供后续重启时直接接手。

## 现象

`zcode --web` 独立服务器模式下，通过 Web UI 创建的定时任务（automations，如"每小时数据盘使用率检查与构建缓存清理"）**永远不会被触发执行**：

- `run_count` / `scheduled_run_count` 恒为 0，`automation_runs` 表始终为空；
- `next_run_at` 持续过期（可落后数小时）无进程认领；
- 任务定义本身正常（enabled=1、cron 表达式有效、lifecycle_status=active）。

## 根因

定时任务的调度器是**桌面端专属的 Electron 进程**，独立服务器从未启动任何调度循环：

```
packages/desktop/src/scheduler/index.ts
// 常驻 cron scheduler 进程：由 desktop main 通过 electronUtilityProcess.fork 拉起。
// - 20s 轮询 tasks-index 的 automations，事务认领到期任务
//   （AutomationRepo.claimDue：BEGIN IMMEDIATE + running 0→1）
// - misfire 宽限 5min（过期超窗记 skipped 不补跑）
// - 派发请求经 Electron IPC 发回 main → workspace host → createTask + sendPrompt
```

全仓检索证实：`AutomationRepo.claimDue` 的唯一消费方是桌面 scheduler
（`packages/desktop/src/scheduler/index.ts:95`）；`zcode --web` 的服务器入口
（`packages/server/src/entry-http.ts`）不启动任何等价循环。Web UI 创建的
定时任务只写入了 `tasks-index.sqlite`，`next_run_at` 过期后永远无人认领。

## 影响范围

- 定时任务（automations）：创建/编辑 UI 可用，但**不会执行**（本文缺陷）。
- 闲时任务（off_peak_tasks）：同一调度器驱动（`offPeakRepo.claimDue` 同处
  一个轮询循环），**同样不会执行**。
- 手动"立即运行"（manual run）：走 `automation_runs` 的 manual 认领路径，
  同样依赖 scheduler 进程结算，预期同样不可用（未单独实测）。

## 修复路线（若未来重启）

在独立服务器内内置调度循环，等价移植桌面 scheduler：

1. **可复用**（纯 Node、已在服务端注册）：
   - `AutomationRepo.claimDue` / `offPeakRepo.claimDue`——认领、misfire 判定、
     失败退避、单飞（running 0→1）状态机全部在 repo 层；
   - 派发目标 `zcodeTaskService.createTask + sendPrompt`——服务端适配器
     （`zcodeTaskServiceAdapter.ts`）本就存在，含 offPeak 派发路径可参考
     （`packages/desktop/src/host/index.ts:705` 附近的 dispatch 链）。
2. **需要新写**：调度循环宿主（建议挂在 `createServerHostServices` 或
   entry-http 启动序列）、派发结果结算回写（成功/失败/misfire-skip →
   `automation_runs` + `next_run_at` 推进）、并发与退出清理。
3. **实测清单**：创建 → 到点触发 → agent 执行 → run 记录回写 → 下轮
   `next_run_at` 推进；misfire（停服超 5min 重启）记 skipped；失败退避。

预计工作量：中等（核心状态机可复用，主要是把 Electron IPC 派发改写为
服务内直调派发 + 结算路径）。

## 结论

- 当前版本 `zcode --web` 的定时/闲时/手动立即运行三类自动化任务均不可用，
  建议在产品文档中明示，或后续按上述路线补齐服务器调度器。
