# 模拟方案生命周期

模拟方案是研究和复盘对象，不是购买单。不得作为出票单、代购入口或跟单入口。

## 核心表

- `simulated_plan`：模拟方案主表。
- `simulated_plan_item`：模拟方案明细。
- `simulated_plan_snapshot`：生成时快照。

## 状态流转

```text
GENERATED
  -> SAVED
  -> PENDING_RESULT
  -> REVIEWED
```

阶段 5 已实现前 3 个状态：

```text
GENERATED -> SAVED -> PENDING_RESULT
```

保存动作必须同时固化方案、明细和生成时快照。后续复盘只能读取快照，不得回读可变分析上下文。

## 已实现 API

```text
POST /api/strategies/simulate
POST /api/simulated-plans
GET  /api/simulated-plans
GET  /api/simulated-plans/{planId}
```

`POST /api/strategies/simulate` 只接受 `USER_SCREENSHOT_CONFIRMED` 来源且 `reportStatus=GENERATED` 的分析报告。返回的方案状态为 `GENERATED`，仅表示已生成候选结构。

`POST /api/simulated-plans` 接收 `generatedPlanId`，保存后返回 `PENDING_RESULT`。此时系统已固化：

- `simulated_plan`：方案主记录、状态、预算和合规说明。
- `simulated_plan_item`：每个模拟选择的比赛、玩法、方向、赔率和模拟预算。
- `simulated_plan_snapshot`：生成时报告、用户确认快照、引擎类型和选择数量。

`GET /api/simulated-plans` 返回已保存模拟方案列表。`GET /api/simulated-plans/{planId}` 返回单个方案详情。

## 前端页面

`/saved-plans` 页面提供：

- 当前分析报告摘要。
- “生成并保存模拟方案”操作。
- 保存后的 `PENDING_RESULT` 列表。
- 明细表格和状态流转文本，作为图表替代。

## 禁止入口

页面和 API 禁止提供支付、出票、代购、跟单、充值、提现等能力。
