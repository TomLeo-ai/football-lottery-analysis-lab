# AI 输出安全

本项目支持默认规则引擎和可选 OpenAI-compatible 大模型预测/复盘洞察。大模型只用于技术研究、模拟分析和解释性复盘，不是官方信息源，不构成购彩建议，也不承诺命中率、收益或确定性结果。

## 输入限制

- 只允许 `sourceType=USER_SCREENSHOT_CONFIRMED` 且 `analysisAllowed=true` 的用户确认快照进入分析。
- 未确认 OCR 字段不得进入规则引擎或大模型。
- 原始截图不直接传给模型；模型输入只使用后端构造的结构化上下文。
- 复盘洞察输入必须来自已保存的模拟方案、历史 `strategyParameters` 快照和规则引擎结算结果。
- 不读取、抓取、缓存或镜像官方彩票页面数据。

## 输出要求

- 必须包含非官方、仅模拟分析/复盘声明。
- 必须表达不确定性和风险。
- 禁止“必中、稳赚、包中、回本、跟投、实单推荐、加注”等高风险表达。
- 不承诺中奖率、收益或确定性结果。
- 大模型输出必须是 JSON。
- OpenAI-compatible Provider 返回的纯 JSON 和完整 `markdown fenced JSON` 都会进入同一套结构化校验；系统只剥离完整包裹的 fenced JSON，不从任意长文本中猜测提取 JSON。
- 预测输出必须包含 `parameterUsage`、`scorePredictions`、`upsetFocus`、`stableMatches`、`ticketGroups`、`finalDecision`、`ledgerSnapshot`、`complianceNotice`。
- 复盘洞察输出必须包含 `settlementAuthorityNotice`、`ticketReviewNarratives`、`failureClassifications`、`strategyRevisionSuggestions`、`nextRoundParameterSuggestions`、`doNotOverreactEvents`、`complianceNotice`。
- 复盘洞察不得改写 `HIT`、`MISS`、`PARTIAL_HIT`、`VOID`、`PENDING`、`NEEDS_REVIEW` 等规则结算状态。

## 后端安全链路

1. `SafetyGuardService` 拦截高风险表达。
2. `LlmOutputValidator` 校验 JSON 结构、合规声明、预算、最长串关、禁用玩法和复盘结算边界。
3. `PromptContextBuilder` 只构造结构化上下文，不传原始截图。
4. `OpenAiCompatibleAnalysisEngine` 只在 `OPENAI_COMPATIBLE` 模式下调用模型。
5. `OpenAiCompatibleReviewInsightEngine` 只在 `RULE_REVIEW_WITH_LLM_INSIGHT` 模式下调用模型，且在规则结算完成后执行。
6. `LlmInvocationAuditService` 记录 hash、token、耗时、安全状态和错误码。

## 阻断策略

- 校验通过：返回 `safetyStatus=PASSED`，报告或洞察可展示。
- 输出违规：返回 `safetyStatus=BLOCKED` 的审计记录，阻断可用报告或洞察。
- 调用异常：返回 `safetyStatus=ERROR` 的审计记录，保留错误码，继续保护密钥和原始内容。
- 所有阻断或错误路径都不得保存 API Key、完整 Prompt 或原始模型输出正文。

## 当前 API

```text
POST /api/analysis/generate
POST /api/simulated-plans/{planId}/settle
```

`POST /api/analysis/generate` 旧请求不传 `engineMode` 时默认 `MOCK_RULE_ENGINE`。显式传入 `OPENAI_COMPATIBLE` 时才调用大模型。

`POST /api/simulated-plans/{planId}/settle` 旧请求或空请求体默认 `RULE_REVIEW_ONLY`。显式传入 `RULE_REVIEW_WITH_LLM_INSIGHT` 时才在规则结算后调用大模型生成洞察。

## 当前页面

```text
/strategy-simulator
/review-center
/model-settings
```

页面必须清晰展示当前使用的引擎、Provider、Prompt 版本、安全状态和审计 ID。模型设置页只展示环境变量名和密钥状态，不展示密钥值。
