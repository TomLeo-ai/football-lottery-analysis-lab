# 复盘与策略修正规则

复盘用于解释模拟方案的结果，不用于承诺未来收益。

## 失败原因枚举

- `DIRECTION_ERROR`
- `PLAY_TYPE_ERROR`
- `PARLAY_STRUCTURE_ERROR`
- `ODDS_VALUE_ERROR`
- `INFO_RISK`
- `RANDOM_EVENT`
- `DATA_ERROR`
- `OCR_ERROR`
- `USER_CONFIRMATION_ERROR`
- `SOURCE_SCREENSHOT_INCOMPLETE`
- `RESULT_MATCHING_ERROR`
- `RESULT_SOURCE_CONFLICT`
- `RESULT_NOT_AVAILABLE`
- `MATCH_POSTPONED_OR_CANCELLED`

## 修正规则原则

- 对可复用错误生成策略修正规则。
- 对红牌、点球、临场伤退等偶发事件标记为 `RANDOM_EVENT`，不得过度拟合。
- 对 OCR 或用户确认问题回写流程改进建议。
- 对赛果源冲突保持 `NEEDS_REVIEW`，不得自动结算。

## Stage 7 已实现规则

- `DIRECTION_ERROR` -> `REVIEW_DIRECTION_WEIGHT`：复盘方向判断权重，下一版策略降低单一方向依赖。
- `PLAY_TYPE_ERROR` -> `REVIEW_PLAY_TYPE_FILTER`：复盘玩法匹配规则，下一版策略优先校验玩法类型。
- `RESULT_MATCHING_ERROR` -> `REVIEW_RESULT_MATCHING`：复盘赛果匹配规则，下一版策略提高比赛元数据完整性。

当前实现只使用 Mock 公开赛果源和虚构样例，输出用于技术研究和模拟复盘，不构成确定性建议。
