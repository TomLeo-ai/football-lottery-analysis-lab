# 结算规则

结算只能作用于已保存的模拟方案和生成时快照，不得使用赛后数据修改原始选择。

## 方案状态

```text
GENERATED -> SAVED -> PENDING_RESULT -> REVIEWED
```

保存后的方案状态必须进入 `PENDING_RESULT`。

## 结算状态

- `HIT`：命中。
- `MISS`：未命中。
- `PARTIAL_HIT`：部分命中。
- `VOID`：比赛延期、取消或规则导致无效。
- `PENDING`：等待赛果。
- `NEEDS_REVIEW`：匹配置信度不足或来源冲突。

## 不可变快照

复盘必须读取 `simulated_plan_snapshot` 中的生成时数据，避免赛后污染。

## Stage 7 接口

```text
GET  /api/reviews/pending
POST /api/simulated-plans/{planId}/match-result
POST /api/simulated-plans/{planId}/settle
GET  /api/simulated-plans/{planId}/review
```

## 当前 WIN_DRAW_LOSS 规则

- 主队比分大于客队比分时，实际结果为 `HOME_WIN`。
- 主队比分小于客队比分时，实际结果为 `AWAY_WIN`。
- 双方比分相等时，实际结果为 `DRAW`。
- 模拟方向与实际结果一致时记为 `HIT`。
- 模拟方向与实际结果不一致时记为 `MISS`，失败原因记为 `DIRECTION_ERROR`。
- 玩法类型不匹配时记为 `NEEDS_REVIEW`，失败原因记为 `PLAY_TYPE_ERROR`。
- 赛果来源缺失、匹配不足或来源冲突时记为 `NEEDS_REVIEW`，不得自动结算。
