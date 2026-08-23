# 截图 OCR 与人工确认

截图流程把用户自有、已获授权或项目虚构的赛前图片转换为待核对的结构化字段。v0.2.0 使用 real local Tesseract OCR（真实本地 Tesseract OCR）；原图和完整 OCR 文本只在当前浏览器临时内存中处理，不上传服务端，也不依赖第三方 OCR 或运行时 CDN。

## 输入和运行时

- 接受 PNG、JPEG、WebP；同时校验 MIME、文件头和解码尺寸。
- 单文件最大 10 MiB，总像素最多 25,000,000；进入 OCR 的长边最多缩放到 2,400 像素。
- 支持旋转、裁剪和遮挡后再识别。遮挡应用于本地工作 Canvas，不会生成或上传一份新的图片文件。
- 锁定 `tesseract.js@7.0.0`、`tesseract.js-core@7.0.0`、`@tesseract.js-data/eng@1.0.0` 和 `@tesseract.js-data/chi_sim@1.0.0`。
- 同源路径为 `/ocr/tesseract/7.0.0/worker/`、`/ocr/tesseract/7.0.0/core/` 和 `/ocr/tesseract/7.0.0/lang/4.0.0_best_int/`；清单位于 `apps/web/src/ocr/ocr-asset-manifest.json`，记录文件大小和 SHA-256。
- 一个活动控制器复用一个 worker；取消、更换图片、失败或离开页面会使旧结果失效并请求终止。控制器对终止的等待默认最多 1 秒，避免 UI 被异常 worker 无限阻塞。

第三方版本、许可证和原生组件清单见 [第三方 OCR 说明](third-party-ocr.md)。

## 当前流程

1. 用户选择来源声明：`FICTIONAL_SAMPLE` 或 `USER_OWNED_AUTHORIZED`。
2. 浏览器检查图片并在内存中完成旋转、裁剪、遮挡和 Tesseract 识别。
3. 浏览器把逐行/逐词结果映射为 `OCR_CANDIDATE_V2`；完整 OCR 文本不会进入后续请求。
4. 服务端创建工作流和 OCR task，只接收图片元数据、处理后尺寸、引擎版本、语言和最小候选字段。
5. 用户在可编辑草稿中增删、排序和修正比赛/市场，保存时使用 revision 和幂等键。
6. 页面刷新或后端进程重启后，应用凭显式 `workflowId` 读取活动草稿并恢复顺序和值；不会寻找“最新”工作流，也不会注入演示数据。
7. 未修改的已保存 revision 才能确认。确认生成 `USER_SCREENSHOT_CONFIRMED`、`SERVER_CONFIRMED_V2`、`CONFIRMED_SNAPSHOT_V2` 快照并开启分析。
8. 分析、方案和复盘从服务端确认快照延伸权威链；未确认候选和客户端重建正文不得进入分析。

当前产品边界只允许 `WIN_DRAW_LOSS`（WDL），selection 只允许 `HOME_WIN`、`DRAW`、`AWAY_WIN`，并要求每场确认一个市场。精确比分、让球、总进球和其他玩法不属于 v0.2.0 确认边界。

## 隐私和缓存

- File、Blob、Object URL、位图、Canvas 像素、完整 OCR 文本和逐词结果只存在于上传页临时内存。
- 原始文件名不显示、不发送、不持久化；候选 evidence 只包含字段 ID、置信度和可选坐标。
- Tesseract 可把公共 `eng` / `chi_sim` 模型写入 IndexedDB 的版本化命名空间；不得把用户图片、像素、OCR 结果、候选或草稿写入 IndexedDB、Cache Storage 或 LocalStorage。
- 浏览器 OCR 资产和工作流请求保持 same-origin；无第三方网络回退。IndexedDB 不可用时只关闭公共模型持久缓存，不把用户数据改存到别处。
- 上传页取消、更换输入或销毁时释放图片资源并清空候选。人工确认后服务端删除 OCR 临时载荷和活动草稿，只保留结构化确认快照、权威标识和最小操作审计。
- 确认前可放弃工作流；服务端会清空截图/OCR 载荷并删除活动草稿。相关墓碑和幂等审计只保存最小状态，不保存原图或完整 OCR 文本。

## 当前 API

```text
POST   /api/ocr/workflows
GET    /api/ocr/workflows/{workflowId}
DELETE /api/ocr/workflows/{workflowId}
POST   /api/ocr/workflows/{workflowId}/ocr-candidates
GET    /api/ocr/review-drafts/{ocrTaskId}
PUT    /api/ocr/review-drafts/{ocrTaskId}
POST   /api/ocr/review-drafts/{ocrTaskId}/confirm
GET    /api/ocr/snapshots/{snapshotId}
```

所有写请求使用 UUID `Idempotency-Key`。草稿保存要求 `expectedRevision`；同一 key 不同 payload、陈旧 revision、重复确认和跨工作流资源都会被拒绝。

## 页面与恢复

```text
/screenshot-upload
/workflows/{workflowId}/ocr-review
/workflows/{workflowId}/match-workspace
/workflows/{workflowId}/analysis
/workflows/{workflowId}/plans
```

恢复优先级是显式 URL `workflowId`，其次是当前标签页 `sessionStorage` 中的 ID，再其次为空状态。显式 ID 无效时必须显示错误，不得回退到另一工作流。

## 明确失败状态

- 文件类型、文件头、大小或像素越界：拒绝进入 OCR。
- 本地资产缺失、WASM/worker 初始化失败：显示稳定错误并允许重试或人工录入，不回退第三方服务。
- 空文本、低置信度或结构化映射失败：进入重试/人工修正，不把未验证内容当成确认数据。
- `SOURCE_SCREENSHOT_INCOMPLETE` 可标记截图证据不完整；`USER_CONFIRMATION_ERROR` 可在复盘时标记人工确认错误。

## Stage 9 证据边界

Stage 9 使用当前 checkout 构建产物、随机端口、专属临时 H2 数据库和持久 Chromium profile，验证真实 OCR、冷/暖模型缓存、可编辑草稿、后端重启恢复、确认、分析、方案深链与隐私扫描。临时数据库不会连接或复用开发者日常 H2；测试结束后停止自有进程并删除临时目录。

页面和仓库中的样例必须标注 `DEMO DATA / FICTIONAL SAMPLE`。Stage 9 通过只证明该提交满足自动化技术边界，不代表真实用户采用或正式发布。
