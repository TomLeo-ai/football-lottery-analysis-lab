# 截图 OCR 与人工确认

截图 OCR 流程用于把用户上传的赛前截图转成待确认的结构化字段。默认使用浏览器本地 OCR，服务端 OCR 只作为可选插件接口预留，默认关闭。

## 流程

1. 用户上传截图。
2. 前端记录截图任务，不把图片作为公共数据发布。
3. 本地 OCR 生成候选字段。
4. 用户进入人工确认页，逐项确认比赛、玩法、赔率、预算和风险偏好。
5. 确认后写入用户快照，`sourceType` 为 `USER_SCREENSHOT_CONFIRMED`。
6. 未确认数据不得进入 AI 分析、模拟方案生成或公开数据源。

## 隐私要求

- 不提交真实用户截图到仓库。
- 示例截图只能是虚构样例，并标注 `DEMO DATA / FICTIONAL SAMPLE`。
- 截图存储策略必须允许后续配置为本地临时存储或用户自管存储。

## 错误状态

- OCR 置信度不足：进入人工修正。
- 截图不完整：标记 `SOURCE_SCREENSHOT_INCOMPLETE`。
- 用户确认错误：复盘时可标记 `USER_CONFIRMATION_ERROR`。

## 当前 API

```text
POST /api/screenshots/tasks
POST /api/ocr/parse-local-result
POST /api/ocr/review/confirm
```

当前实现为首版内存闭环：创建截图任务后返回 `WAITING_LOCAL_OCR`，服务端 OCR 固定为关闭；本地/Mock OCR 结果进入 `WAITING_USER_CONFIRMATION`，且 `analysisAllowed=false`；人工确认后生成 `USER_SCREENSHOT_CONFIRMED` 快照。

## 当前页面

```text
/screenshot-upload
/ocr-review
```

页面默认使用虚构样例，显著标注 `DEMO DATA / FICTIONAL SAMPLE`。
