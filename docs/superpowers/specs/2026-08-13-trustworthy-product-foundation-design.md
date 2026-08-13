# Release v0.2.0 可信产品底座设计

状态：待用户书面规格审阅
日期：2026-08-13
基线：`origin/main@2126a1d1621078bf4f9505aa9c576ab37139625f`
分支：`codex/trustworthy-product-foundation`

## 1. 决策摘要

Release v0.2.0 采用用户已选择的 A 路线；本文的具体协议与验收规格仍待书面批准。目标是先把现有 Mock 演示流程升级为真正可用的本地输入工作流：

1. 浏览器读取真实图片，并通过本地 Web Worker 完成 OCR；
2. 用户在提交前裁剪、旋转和遮挡敏感区域，原图不上传；
3. OCR 只负责辅助提取，用户必须在可编辑表单中确认比赛和市场；
4. 服务端从数据库加载已确认快照和分析报告，不再信任客户端重传的权威字段；
5. 工作流 ID 保存在浏览器 `sessionStorage`，页面刷新后可以恢复服务端已持久化的阶段；
6. 首版端到端结算只支持 `WIN_DRAW_LOSS`，不暴露尚未闭环的其他玩法；
7. v0.2.0 中一条 market 表示“一场比赛的一个已选方向及其十进制赔率”，不是完整的三方向赔率簿；每场比赛只能确认一条；
8. 所有会创建或推进资源的 API 都使用数据库持久化的幂等键，重复、并发和进程重启不会重复创建快照、报告或方案；
9. Release v0.2.0 不增加统计预测模型、不接入远程赛事数据、不实现官方页面抓取。

该范围是一个连续的可信输入与状态链。统计基线、数据许可台账、预测运行清单、Walk-forward 回测和校准看板属于后续 v0.3.0 规格，不塞入本次实现计划。

## 2. 当前问题与源码证据

当前项目的页面、数据库、规则引擎、可选 LLM、模拟方案和复盘链已经存在，但以下四个断点使其仍属于虚构演示：

- `ScreenshotUpload.vue` 只读取文件名、MIME 和大小，随后提交硬编码 OCR 文本和字段；图片像素从未进入 OCR。
- `packages/ocr-core` 只有占位 README，没有可执行代码。
- `OcrReviewWizard.vue` 的比赛、市场、赔率、预算和风险偏好是固定值；用户不能修改 OCR 结果。
- `AnalysisGenerateRequest` 允许客户端声明 `sourceType`、`analysisAllowed`、比赛和市场，`AnalysisServiceImpl` 未按 `snapshotId` 回查数据库。
- `StrategySimulationRequest` 允许客户端重新提交整份报告数据，`SimulatedPlanServiceImpl` 未按 `reportId` 加载权威分析报告。
- Pinia 只保存内存状态；刷新后 OCR 与分析流程丢失。
- 结算服务只支持 `WIN_DRAW_LOSS`，但现有策略默认配置仍可能出现其他玩法。

本设计不把“增加更多模型”放在第一位，因为在输入、确认和谱系可被客户端绕过时，模型复杂度不会提高结果可信度。

## 3. 设计依据与许可证边界

本次只借鉴公开项目的设计模式，默认独立实现，不复制外部源代码：

- [WorldCupArena](https://github.com/wzk1015/WorldCupArena)：借鉴冻结输入、结构化输出、状态分层和语义校验；不借鉴自动赔率、新闻和赛事抓取。
- [penaltyblog](https://github.com/martineastwood/penaltyblog)：后续借鉴统一模型接口和概率评价；本次不引入其 Python/Cython 代码或博彩功能。
- [Hicruben/world-cup-2026-prediction-model](https://github.com/Hicruben/world-cup-2026-prediction-model)：后续借鉴赛前冻结和只追加复盘；本次不复用世界杯参数或数据。
- [PySport/kloppy](https://github.com/PySport/kloppy)：借鉴 Adapter 到 Canonical DTO 的边界；不认为 Provider 支持等同于数据授权。
- [Tesseract.js](https://github.com/naptha/tesseract.js)：作为浏览器 OCR 实现，使用其 Web Worker/WASM 能力。v0.2.0 精确锁定 `tesseract.js@7.0.0`、`tesseract.js-core@7.0.0`、`@tesseract.js-data/eng@1.0.0` 和 `@tesseract.js-data/chi_sim@1.0.0`；上游引擎、core 和官方 tessdata 均按 Apache-2.0 义务处理，npm 包自身元数据也逐项记录，不用一个软件许可证替代全部资产审计。

实现阶段必须：

- 精确锁定直接和传递依赖版本到 `package-lock.json`；
- 把 Tesseract.js、WASM Core、`eng` 和 `chi_sim` 语言数据作为同源静态资产提供，不在运行时依赖第三方 CDN；
- 为 worker、全部 core fallback/SIMD/relaxed-SIMD 文件和 `4.0.0_best_int/*.traineddata.gz` 生成受版本控制的资产 manifest，记录相对 URL、精确版本、字节数和 SHA-256；
- 在 `NOTICE` 和第三方许可清单中记录每个 OCR 组件/资产的上游 URL、SPDX、版权、精确版本和哈希，并保留适用的上游 LICENSE/NOTICE；
- `tesseract.js-core@7.0.0` 的 WASM 还必须按该 tag 的精确 submodule commit 审计嵌入的原生组件，而不能只看 npm lock：至少覆盖 Leptonica、libjpeg、giflib、libpng、libtiff、libwebp、zlib、Tesseract fork 和 openlibm；逐项记录许可证、版权、归属/NOTICE 和 source commit，并由 CI 对清单完整性做结构化校验；
- 不提交第三方真实截图、官方 Logo、官方数据集或用户图片。

## 4. 目标

### 4.1 用户目标

- 用户可以选择 PNG、JPEG 或 WebP 图片，在浏览器内看到预览并进行裁剪、旋转、遮挡。
- OCR 使用真实处理后的像素，而不是 Mock 字符串。
- 用户可以添加、删除和修改多场比赛，并为每场维护一条已选方向/赔率。
- OCR 失败或识别不完整时，用户仍可进入空白人工表单完成录入。
- 确认后生成不可变 `USER_SCREENSHOT_CONFIRMED` 快照。
- 刷新页面后可恢复已提交到服务端的 OCR 草稿、确认快照、分析报告和方案状态。

### 4.2 可信性目标

- 原始图片、Data URL、Blob、像素数据和完整 OCR word list 不发送给后端。
- 后端只接收完成流程所需的候选结构化字段和处理元数据。
- 分析服务只使用数据库中的已确认快照。
- 方案服务只使用数据库中的已生成分析报告。
- 客户端重传或篡改权威字段不能改变服务端结果。
- 确认快照不可原地修改。
- 同一个合法写请求在网络重试、并发提交或服务端重启后只产生一个资源。

### 4.3 工程目标

- 保留现有 Vue 3、Pinia、Spring Boot、JDBC、Flyway 和 H2 架构。
- 将 OCR 领域逻辑从 Vue 页面中拆到有明确接口的模块。
- 新增字段级校验、状态冲突和恢复测试。
- 增加一个真实浏览器 OCR 黄金样例并纳入 CI。
- 保持旧的已保存方案和复盘记录可读。
- 新增 workflow/task/snapshot/report/plan ID 使用服务端随机 UUID，不继续扩展单 JVM `AtomicLong(max+1)` ID 生成方式。

## 5. 非目标

Release v0.2.0 明确不做：

- 不实现真实购彩、支付、出票、代购、合买、跟单或财务决策功能；
- 不抓取、缓存、镜像或再发布官方彩票网站及其数据；
- 不上传图片到服务端，也不新增服务端 OCR；
- 不引入远程 OCR API、云存储或图像对象存储；
- 不实现用户账号、多租户、远程部署身份认证；项目仍按本地单用户实验室设计；
- 不支持多后端实例或水平扩展；v0.2.0 只支持一个本地 Spring Boot 进程，但仍用数据库唯一约束保护该进程中的并发请求；
- 不实现任意第三方 JAR/插件动态加载；
- 不增加 Elo、Poisson、Dixon-Coles、训练或回测；
- 不增加 `WIN_DRAW_LOSS` 以外的结算玩法；
- 不自动创建 GitHub Release，不自动删除分支。

## 6. 总体架构

```text
用户本地图片
  -> 浏览器文件校验
  -> Canvas 工作副本：旋转 / 裁剪 / 遮挡 / 缩放
  -> Tesseract.js Web Worker（同源 WASM + eng/chi_sim）
  -> 浏览器内 raw text / words / bounding boxes
  -> OcrCandidateMapper 生成可编辑候选
  -> 仅候选字段和 OCR 元数据提交到 Spring Boot
  -> 服务端 OCR Review Draft
  -> 用户编辑并保存草稿
  -> 服务端原子确认并生成不可变快照
  -> AnalysisService 按 snapshotId 加载快照
  -> AnalysisEngine
  -> AnalysisReport
  -> SimulatedPlanService 按 reportId 加载报告
  -> 模拟方案与既有复盘链
```

### 6.1 模块边界

#### `packages/ocr-core`

从占位目录升级为 TypeScript workspace package，负责：

- OCR 输入、输出、进度、错误和取消接口；
- 图片尺寸、裁剪和遮挡几何类型；
- OCR confidence 归一化；
- bounding box 归一化；
- 候选字段和草稿种子类型；
- 纯函数校验与候选映射。

该包不得依赖 Vue、Pinia、DOM 组件或后端 API。调用方可以替换 OCR Adapter，而不用修改页面表单和后端 DTO。

#### `apps/web` 浏览器 OCR Adapter

负责：

- 文件读取和 MIME/解码校验；
- `createImageBitmap`/Canvas 工作副本；
- Tesseract.js Worker 生命周期；
- 同源 OCR 资产路径；
- OCR 进度、取消和重试；
- 将 OCR Core 的候选草稿交给 Vue 页面。

#### `apps/web` Vue 页面

页面只负责交互和状态编排：

- Screenshot Upload：来源声明、预览、旋转、裁剪、遮挡、OCR 进度；
- OCR Review：多比赛及逐场单一选择可编辑表单、保存草稿、确认；
- Dashboard/Strategy Simulator：恢复当前工作流并跳转到下一合法阶段。

#### `apps/server` 工作流服务

负责：

- 持久化 OCR 工作流、草稿和不可变确认快照；
- 校验状态转换、草稿 revision、比赛与市场关系；
- 以数据库记录作为分析和方案生成的唯一权威来源；
- 以数据库持久化的幂等记录处理重复、并发和重启后的写请求；
- 返回统一的错误码和字段错误。

## 7. 图片与本地 OCR 设计

### 7.1 输入限制

固定支持：

- `image/png`
- `image/jpeg`
- `image/webp`

固定拒绝 SVG、GIF、PDF、HEIC、可执行文件和 MIME/实际解码不一致的内容。

PNG/JPEG/WebP 在创建完整 Canvas/ImageBitmap 前先解析最小文件头取得尺寸并执行像素上限检查；完整解码后再核对实际尺寸和 MIME。头部解析不能取代浏览器解码校验，但要把极端尺寸图片的拒绝前移，降低解码前内存峰值。

限制：

- 原始文件最大 10 MiB；
- 解码后最大 25,000,000 像素；
- OCR 工作副本最长边缩放到不超过 2400 像素；
- 保持长宽比，不放大原本较小的图片；
- 所有限制在启动 OCR 前给出明确错误。

这些限制是 v0.2.0 的产品契约，不做隐藏自动放宽。

### 7.2 来源声明

开始 OCR 前必须显式选择且不得预选：

- `FICTIONAL_SAMPLE`：仓库内虚构样例；
- `USER_OWNED_AUTHORIZED`：用户自有或明确获授权的图片。

选择 `USER_OWNED_AUTHORIZED` 时必须确认：

- 图片不包含 API Key、Token、Cookie、支付信息或不必要的私人身份信息；
- 图片不是需要复制、公开或再发布的官方彩票网站截图、Logo 或官方数据集；
- 用户理解只有经人工确认的结构化字段会进入后续模拟分析。

服务端保存枚举和政策版本，不保存勾选文案副本。

### 7.3 处理副本

- 原始 `File` 只存在浏览器内存中。
- 页面创建一个非破坏性工作副本，用于旋转、裁剪和遮挡。
- JPEG EXIF orientation 在创建工作副本时规范化且只应用一次；后续 rotation/crop/bbox 均基于规范化后的像素坐标。EXIF 与其他文件元数据不序列化、不上传。
- 旋转粒度为 90 度；裁剪只保留一个矩形区域。
- 用户可以添加多个不透明遮挡矩形；OCR 必须使用遮挡后的像素。
- 新选文件、离开页面或取消任务时撤销 Object URL，释放 ImageBitmap、Canvas 和 Worker 资源。
- 浏览器刷新后不恢复图片和预览；因为图片从未持久化。若工作流仍停在 `WAITING_LOCAL_OCR`，用户必须重新选择图片。
- 每次 OCR run 使用递增 token；换图、取消或组件卸载后到达的旧 Worker 结果必须丢弃，不能覆盖新任务。清理同时执行 Worker `terminate`、Object URL revoke、`ImageBitmap.close()`（若存在）和 Canvas 清空。

### 7.4 OCR Engine

- 默认 Adapter ID：`TESSERACT_JS`。
- 默认语言：`eng` 与 `chi_sim`。
- Worker 固定使用 `OEM.LSTM_ONLY`，核心配置等价于：

```ts
{
  cacheMethod: 'write',
  cachePath: 'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int',
  gzip: true,
  legacyCore: false,
  legacyLang: false
}
```

资产版本升级时必须同时变更 URL、manifest 和 `cachePath`，防止旧 traineddata 与新 Core 混用。
- OCR 在 Web Worker 中执行，不阻塞 Vue 主线程。
- 一个页面会话复用一个 Worker；取消当前任务时终止 Worker，下一次重试重新创建。
- Worker、Core 和语言数据必须从应用同源 URL 加载。
- 显式配置同源 `workerPath`、目录形式的 `corePath` 和带版本的 `langPath`；`corePath` 必须同时提供 v7 运行时选择所需的 fallback、SIMD 与 relaxed-SIMD 变体，不能硬编码只在开发机可运行的单一 wrapper。
- 所有资产 URL 从 `import.meta.env.BASE_URL` 和版本 manifest 构造，支持部署在非根路径；优先设置 `workerBlobURL=false` 从同源直接启动 Worker。若目标 Chromium 实测必须保留 Blob Worker，CSP 仅增加最小 `worker-src 'self' blob:` 并记录原因。
- Tesseract.js v7 默认输出不足以自动保证 word/bbox；Adapter 必须在真实 `recognize` 调用中显式请求 text 和 blocks/word-level 输出，再转换为 OCR Core 坐标模型，不能只在 jsdom fake 中制造 bounding box。
- 运行时若发现外部 CDN 请求，真实 OCR 浏览器测试必须失败。
- OCR 进度显示加载语言、识别和完成阶段；不得伪造百分比。
- OCR 依赖惰性加载，首次进入 OCR 操作才下载公共模型/WASM；冷缓存和热缓存都纳入目标 Chromium 测试。
- 允许 Tesseract 将公共、版本化语言模型写入 IndexedDB 缓存；不得把用户 File、Blob、Object URL、Canvas 像素、raw OCR、candidate 或 draft 写入 Cache API、IndexedDB 或 LocalStorage。
- 本版本不注册 Service Worker，也不宣传离线 PWA 或断网重载；“无 CDN/无外网依赖”只表示运行资产由应用同源提供。

### 7.5 OCR 输出最小化

浏览器内可以临时保留：

- 完整 raw text；
- word/line 结果；
- confidence；
- bounding boxes。

服务端不得接收或保存：

- 图片、Blob、Data URL、Base64、像素；
- 完整 word list；
- 未经过候选映射的整段 OCR raw text。

服务端只接收用户准备进入人工确认的候选字段：

- `fieldId`
- `entityType`：`MATCH` 或 `MARKET`
- `entityKey`：浏览器生成的草稿内临时 UUID
- `fieldName`
- `fieldValue`
- `confidence`，范围 `[0, 1]`
- 可选 `boundingBox`：`x/y/width/height`，均为处理后图片的像素坐标

bbox 数值必须有限且非负，width/height 大于 0，并完整落在声明的 processed width/height 内；超界不做静默裁剪。rotation、crop 与 transform schema version 一并解释该坐标空间。

候选字段白名单固定如下：

| `entityType` | 允许的 `fieldName` | 值规则 |
|---|---|---|
| `MATCH` | `matchDate` | 可缺失；非空时为 `YYYY-MM-DD` |
| `MATCH` | `league` | 可缺失；1–128 字符 |
| `MATCH` | `homeTeam` | 可缺失；1–128 字符 |
| `MATCH` | `awayTeam` | 可缺失；1–128 字符 |
| `MATCH` | `kickoffTime` | 可缺失；非空时为带 offset 的 ISO-8601 |
| `MARKET` | `matchRef` | 必填；值必须精确等于当前 payload 中一个 `MATCH.entityKey` |
| `MARKET` | `playType` | 可缺失；非空只能为 `WIN_DRAW_LOSS` |
| `MARKET` | `selection` | 可缺失；非空只能为三个 v0.2 selection 之一 |
| `MARKET` | `odds` | 可缺失；非空为规范化十进制字符串且符合赔率范围 |

同一 `(entityType, entityKey, fieldName)` 最多一条；`entityKey` 必须是 payload 内对应类型唯一 UUID。每个 MARKET 必须恰好一条 `matchRef`，但同一 MATCH 在候选阶段最多也只允许一个 MARKET entity；未知字段、重复同名字段、冲突 `matchRef` 或孤儿 MARKET 使整批 parse 返回 422 且不写入半个 task/draft。候选允许字段缺失，草稿种子对缺失字段使用空值并等待人工编辑；空字符串按缺失处理但不能绕过最终确认。多个 MATCH/MARKET 以 candidate 数组中各 entityKey 首次出现的顺序建立草稿顺序，关联不通过猜测文本或数组位置推导。

现有数据库 `ocr_task.raw_text` 字段为兼容旧数据保留；v0.2 新写入必须为 `NULL`。

### 7.6 识别失败降级

以下情况不得自动改用远程 OCR 或假装 Mock 成功：

- WASM/语言资产加载失败；
- 图片无法解码；
- Worker 崩溃；
- 用户取消；
- 没有识别到可映射字段。
- IndexedDB 不可用、WASM 特性不支持、空文本或低置信度结果。

IndexedDB 缓存失败但模型已在内存中成功加载时，允许本次识别继续，并提示“公共模型无法持久缓存”；只有模型本身不可用时才进入重试/人工录入。

页面提供两种显式选择：

1. 调整图片后重新运行本地 OCR；
2. 创建空白人工确认草稿。

虚构样例按钮仍保留，但必须加载仓库内真实虚构图片并真实运行 OCR，不再直接构造 Mock 字符串。

## 8. 可编辑人工确认

### 8.1 草稿模型

OCR 候选只用于预填，用户最终编辑的是结构化 Review Draft：

```text
ReviewDraft
  workflowId
  ocrTaskId
  revision
  riskPreference
  budgetAmount
  currency
  matches[]
  markets[]
  updatedAt
```

草稿允许暂时不完整并可保存。只有 Confirm 操作要求所有必填字段和跨对象关系通过校验。

### 8.2 比赛编辑

每场比赛包含：

- `draftMatchKey`：客户端草稿 UUID，只在确认前使用；
- `matchDate`：ISO `YYYY-MM-DD`；
- `league`：1 至 128 字符；
- `homeTeam`：1 至 128 字符；
- `awayTeam`：1 至 128 字符，不能和主队相同；
- `kickoffTime`：带时区的 ISO-8601 时间。

用户可以添加、删除、重排比赛。删除仍被市场引用的比赛时，前端先提示并要求同时删除关联市场；服务端始终重新校验，不能只信前端。

规范化与顺序规则：

- `draftMatchKey` 和 `draftMarketKey` 由客户端生成 UUID，表单只读展示或隐藏，不允许手工编辑；各自在 draft 内唯一，刷新后保持不变；
- 服务端确认时生成新的不可变 `matchId` 和 `marketId` UUID，不能接受客户端伪造正式 ID；
- 联赛、球队先做 Unicode NFC 和首尾空白 trim，内部空白和显示大小写保留；规范化后为空即失败；
- 主客队相等判断使用规范化后、与语言环境无关的大小写不敏感比较；
- enum 必须提交文档中的大写精确值，不做大小写容错；
- 数组顺序是用户顺序，保存、刷新、确认和读取后必须保持；snapshot 通过显式 position 或稳定 JSON 数组顺序持久化；
- 删除比赛时采用“确认后级联删除草稿内唯一关联 market”；整个 draft 作为一个 revision 原子保存，不允许只删除一边；
- `kickoffTime` 必须是带 UTC offset 的 ISO-8601 datetime，转换到其自身 offset 后的日期必须等于 `matchDate`。

### 8.3 市场编辑

v0.2.0 中的 `market` 是一条用户准备纳入模拟的“已选方向及其赔率”，不是同一场比赛 HOME/DRAW/AWAY 三个方向组成的完整市场。保留 `markets[]` 字段是为了支持多场比赛；它不表示一场比赛可以重复选择多个方向。

每条 market 包含：

- `draftMarketKey`：客户端草稿 UUID；
- `draftMatchKey`：必须引用当前草稿中的比赛；
- `playType`：v0.2.0 只能为 `WIN_DRAW_LOSS`；
- `selection`：只能为 `HOME_WIN`、`DRAW`、`AWAY_WIN`；
- `odds`：十进制，范围 `[1.01, 1000]`，最多四位小数。

确认时必须满足：

- 至少一场比赛；
- 每场比赛恰好关联一条 market；
- market 数量与 match 数量相等；
- 同一 `draftMatchKey` 不能出现第二条 market，即使 selection 不同；
- 不存在没有 market 的比赛或没有有效比赛引用的 market。

该限制与当前规则引擎“一场比赛读取一个选择项”的语义一致，防止同场多个方向被错误地共享一份概率分析。完整三方向赔率簿和组合选择属于后续独立规格。

### 8.4 模拟参数

- `currency` 在 v0.2.0 只能为 `CNY`；
- `budgetAmount` 必须大于 0，且不超过 `1,000,000`；
- `budgetAmount` 最多两位小数，最小值为 `0.01`；
- `riskPreference` 只能为 `CONSERVATIVE`、`BALANCED`、`AGGRESSIVE`。

这些金额只表示模拟参数。页面必须继续展示“非官方、仅模拟、不构成财务建议”。

### 8.5 保存与确认

- `PUT` 保存草稿需要携带 `expectedRevision`。
- 服务端使用乐观锁；revision 不一致返回 HTTP 409 `DRAFT_REVISION_CONFLICT`。
- 保存草稿可以返回字段警告，但不得创建确认快照。
- Confirm 请求只携带 `expectedRevision`；`ocrTaskId` 位于 URL，幂等键位于 `Idempotency-Key` 请求头，不再重传整份比赛/市场数据。
- 服务端在一个事务内读取草稿、完成最终校验、生成服务端 match/market ID、写入不可变快照并推进工作流。
- 同一确认事务在快照落库成功后清除候选字段和 draft 正文；`ocr_task` 只保留引擎/语言/处理尺寸/遮挡数量/时间等最小 provenance，`fields_json` 与 v2 candidate payload 置空。确认后的恢复只读 snapshot，不继续保留预确认候选副本。
- 对同一幂等键和相同 `ocrTaskId + revision` 重复 Confirm，返回已有快照，不重复创建；相同 task/revision 使用新幂等键时由唯一确认约束保护并返回 409 及 `currentSnapshotId`。
- 已确认快照不能原地修改；v0.2.0 若需更正，用户新建工作流。

## 9. 服务端权威谱系

### 9.1 分析生成

新的前端请求只发送：

```json
{
  "snapshotId": "snapshot-...",
  "engineMode": "MOCK_RULE_ENGINE",
  "providerKey": null,
  "modelId": null,
  "promptVersion": null,
  "analysisOptions": null
}
```

请求另带 `Idempotency-Key: <UUID>`。该键不放进业务 JSON。

引擎字段条件矩阵固定如下：

| `engineMode` | `providerKey` | `modelId` | `promptVersion` |
|---|---|---|---|
| `MOCK_RULE_ENGINE` | 必须为 null/缺失 | 必须为 null/缺失 | 必须为 null/缺失 |
| `OPENAI_COMPATIBLE` | 必填，且必须是 `GET /api/model-providers` 当前注册的 provider key | 必填；必须由用户从 provider 详情中明确选择/接受并原样提交，trim 后 1–128 字符；不允许服务端使用可变默认值补全 | 可为 null/缺失，此时冻结固定的 `danche-prediction-v1`；非空只允许 `danche-prediction-v1` |

`engineMode` 只能是表中两个精确大写值，不能为 null、`USE_GLOBAL` 或从全局设置隐式推断；这是用户每次分析时的显式选择。Mock 请求携带任一 LLM 字段、OpenAI-compatible 缺 provider/model、未知 provider、空白/超长 model 或未知 prompt 均在预约 operation/Provider 调用前返回 400 `INVALID_ANALYSIS_ENGINE_CONFIGURATION`。幂等 hash 使用客户端明确提交的 provider/model 与补全固定 prompt 后的 resolved config，report 与 audit 也冻结相同 resolved 值；API Key 永不进入请求或 hash。Provider registry 的默认 model 只用于 UI 预填，用户点击生成前必须把该具体 modelId 放进请求，因此 registry 默认值变化不会改变同一 wire request 的 hash。

服务端必须：

1. 按 `snapshotId` 读取数据库；
2. 要求 `authorityVersion=SERVER_CONFIRMED_V2`；
3. 要求 `sourceType=USER_SCREENSHOT_CONFIRMED`；
4. 要求 `snapshotStatus=CONFIRMED` 且 `analysisAllowed=true`；
5. 从快照转换 `AnalysisMatchRequest` 和 `AnalysisMarketRequest`；
6. 使用快照中的预算、币种和风险偏好覆盖或校验策略参数中的对应字段；
7. 再调用选定 Analysis Engine；
8. 保存报告并把报告与 workflow、snapshot 建立关联。

新建 `AnalysisOptionsRequest`，只允许当前仍可由用户调整的非权威模拟选项：ticket count、预算比例、娱乐票开关/上限、最大组合腿数、最低回报要求、低回报开关和 upset coverage。它不包含 `budgetAmount`、`currency`、`riskPreference`、`preferredPlayTypes`、`excludedPlayTypes` 或 `exactScorePolicy`。

`analysisOptions` 可以为 `null`，也可以是以下字段均可选的精确对象；缺失字段在请求开始时按固定 v2 默认值补齐，解析后的完整对象和 `defaultsVersion=STRATEGY_DEFAULTS_V2` 冻结进 report：

| 字段 | 类型与范围 | v2 默认值 |
|---|---|---|
| `targetTicketCount` | integer，1–100 | 5 |
| `minTicketCount` | integer，1–100，且 `min <= target <= max` | 5 |
| `maxTicketCount` | integer，1–100 | 6 |
| `mainTicketRatio` | decimal 0–1，最多 2 位小数 | 0.60 |
| `defensiveTicketRatio` | decimal 0–1，最多 2 位小数 | 0.30 |
| `entertainmentTicketRatio` | decimal 0–1，最多 2 位小数；三项合计必须为 1.00 | 0.10 |
| `enableEntertainmentTicket` | boolean | true |
| `entertainmentTicketMaxCost` | decimal 0–snapshot budget，最多 2 位小数 | `min(2.00, budget)` |
| `maxParlayLegs` | integer，1–`min(10, matchCount)` | `min(4, matchCount)` |
| `minPayoutRequirement` | null 或 decimal 0–1,000,000，最多 2 位小数 | null |
| `allowLowReturnTicket` | boolean | false |
| `upsetCoverageLevel` | `NONE/LIGHT/BALANCED/STRONG` | `BALANCED` |

如果只提供部分 ratio，先以默认值补全后再要求总和 1.00；不自动重新缩放。JSON number 必须有限，拒绝字符串数字、NaN/Infinity 和多余小数。任何 option 校验失败返回 400，不能启动 Analysis Engine 或预约 Provider 调用。

服务端据 snapshot 与 options 组装内部 `ResolvedStrategyParameters`：`budgetAmount`、`currency`、`riskPreference` 来自 snapshot；`preferredPlayTypes` 固定为仅含 `WIN_DRAW_LOSS`；`excludedPlayTypes` 固定为空；`exactScorePolicy` 固定为 `DISABLED`。旧的 `StrategyParameterRequest` 不再直接作为 analysis API DTO。客户端发送这些权威/固定字段或任何未知字段返回 400，不做覆盖或静默归一化。

客户端不得再声明 `sourceType`、`analysisAllowed`、比赛、市场、预算、币种或风险偏好。针对该端点使用精确属性白名单；出现这些旧权威字段或任意未知字段时返回 HTTP 400 `CLIENT_ASSERTED_AUTHORITY_NOT_ALLOWED`，而不是静默忽略。

每个 workflow 在 v0.2.0 只允许成功生成一份当前报告。网络状态未知时，客户端使用同一幂等键重试或通过 workflow detail 恢复；不得通过更换键绕过 `CONFIRMED -> ANALYSIS_GENERATED` 的唯一状态转换。前端禁用重复点击只是体验优化，不是幂等保证。

### 9.2 方案生成

新的前端请求只发送：

```json
{
  "reportId": "analysis-..."
}
```

请求另带 `Idempotency-Key: <UUID>`。

服务端必须：

1. 按 `reportId` 读取 `analysis_report`；
2. 要求报告状态为 `GENERATED`、`safetyStatus=PASSED` 且关联 v2 确认快照；`BLOCKED`、`ERROR` 或缺失值一律拒绝；
3. 从报告中读取 source type、snapshot、engine、策略参数、概率、风险提示和模拟选择；
4. 生成方案，不接受客户端重传上述内容；
5. 同一 `reportId` 只能生成一个 plan；同一 key 的幂等重放返回已有 plan，新 key 重做则返回 409 及 `currentPlanId`。

出现旧报告字段或未知字段时返回 HTTP 400 `CLIENT_ASSERTED_REPORT_NOT_ALLOWED`。

### 9.3 保存与复盘

现有 `POST /api/simulated-plans`、列表和复盘 URL 保持；`GET /api/simulated-plans/{planId}` 的语义收紧为按 ID 返回属于当前 workflow 谱系的完整 v2 plan，并允许 `GENERATED` 或 `PENDING_RESULT`，旧 plan 仍只按既有可见规则读取。workflow aggregate 返回 `currentPlanId` 和摘要，前端据该 ID 调 detail 恢复完整 generated plan 后才能审阅/保存。保存操作只能把这个服务端已有 `GENERATED` plan 转换为 `PENDING_RESULT`，不能接受客户端重建 plan items。

### 9.4 谱系防篡改威胁模型

本版本保护的是本地单用户场景中的业务谱系完整性：错误或恶意客户端不能伪造已确认状态、替换快照内容、重放不同请求、并发创建重复资源，或用客户端报告覆盖服务端报告。防护必须存在于服务端事务、状态校验、精确 JSON 白名单和持久化幂等记录中。

本版本不声称提供账号隔离、多租户授权、远程攻击面的完整身份认证或数据库管理员级防篡改。若部署范围从本机扩大到局域网或互联网，必须先做新的认证、授权、CSRF/CORS、速率限制和密钥管理规格，不能把本设计直接视为公网安全方案。

## 10. 工作流状态机与恢复

### 10.1 持久化状态

```text
WAITING_LOCAL_OCR
  -> WAITING_USER_CONFIRMATION
  -> CONFIRMED
  -> ANALYSIS_GENERATED
  -> PLAN_GENERATED
  -> PENDING_RESULT

WAITING_LOCAL_OCR 或 WAITING_USER_CONFIRMATION
  -> ABANDONED
```

约束：

- `OCR_RUNNING` 是浏览器临时状态，不写入服务端；失败后仍为 `WAITING_LOCAL_OCR`。
- 同一 workflow 可以在确认前多次运行 OCR；从 `WAITING_USER_CONFIRMATION` 替换 OCR 时必须显式确认 `replaceDraft=true`，新 OCR task 激活后，旧 task 和旧 draft 标记为 `SUPERSEDED`，不做隐式字段合并。
- Confirm 后不允许回到 OCR 草稿阶段。
- 分析失败不会改变 `CONFIRMED`；成功后推进到 `ANALYSIS_GENERATED`。
- 方案生成失败不会改变 `ANALYSIS_GENERATED`；成功后推进到 `PLAN_GENERATED`。
- 保存方案后进入既有 `PENDING_RESULT` 和复盘流程。

合法转换固定如下：

| 操作 | 允许的起始状态 | 成功后的状态 | 失败语义 |
|---|---|---|---|
| 创建 workflow | 无 | `WAITING_LOCAL_OCR` | 参数错误 400，不创建半成品 |
| 提交本地 OCR 候选 | `WAITING_LOCAL_OCR` | `WAITING_USER_CONFIRMATION` | 父资源不存在 404；版本冲突 409 |
| 创建空白人工草稿 | `WAITING_LOCAL_OCR` | `WAITING_USER_CONFIRMATION` | 父资源不存在 404；版本冲突 409 |
| 显式替换 OCR/draft | `WAITING_USER_CONFIRMATION` | `WAITING_USER_CONFIRMATION` | 未传 `replaceDraft=true` 或版本冲突 409 |
| 保存 Review Draft | `WAITING_USER_CONFIRMATION` | 不变 | revision/阶段冲突 409 |
| Confirm | `WAITING_USER_CONFIRMATION` | `CONFIRMED` | 业务校验 422；阶段冲突 409 |
| 生成分析 | `CONFIRMED` | `ANALYSIS_GENERATED` | Provider 失败 502 且阶段不变；阶段冲突 409 |
| 生成方案 | `ANALYSIS_GENERATED` | `PLAN_GENERATED` | 报告/阶段冲突 409 |
| 保存方案 | `PLAN_GENERATED` | `PENDING_RESULT` | 方案/阶段冲突 409 |
| 放弃未确认 workflow | `WAITING_LOCAL_OCR` 或 `WAITING_USER_CONFIRMATION` | `ABANDONED` | 已确认后不允许，返回 409 |

除表中显式允许的自转换外，不能跳级、回退或重复推进。读取不存在的父资源返回 404；资源存在但阶段不允许返回 409。任一状态推进、当前实体 ID 更新和业务实体写入必须处于同一事务。客户端传来的 workflow stage 永远不参与服务端判定。

`SAVED` 在现有 `statusFlow` 中只是展示事件，不是数据库持久状态；保存成功后的权威 plan 状态仍为 `PENDING_RESULT`。本次不改造复盘完成后的 plan 状态模型，review 记录仍是复盘事实来源，避免把可信输入范围扩散到既有后半段生命周期重构。

### 10.2 Workflow Aggregate

新增 `ocr_workflow` 作为恢复索引，至少包含：

- `workflow_id`：随机 UUID；
- `current_stage`；
- `version`：乐观锁版本；
- `current_ocr_task_id`；
- `confirmed_snapshot_id`；
- `current_report_id`；
- `current_plan_id`；
- `created_at`；
- `updated_at`。

所有状态推进在数据库事务内校验当前阶段和 version。

状态推进必须使用单条 compare-and-set 更新：`UPDATE ... WHERE workflow_id=? AND version=? AND current_stage=?`；受影响行数不是 1 就返回 409 及当前 stage/version/current IDs。禁止“先 SELECT 再无条件 UPDATE”的竞态窗口。

v2 记录以结构化状态列、外键和 version 列作为状态机权威；`payload_json` 只保存不可变业务 payload 或兼容旧数据，不能作为可变状态的第二权威来源。GET 响应中的 current stage/status 必须来自结构化列。若兼容 payload 内仍有旧 status 字段，repository 读取后必须用结构化列覆盖；同一事务内写业务 payload 和结构化索引，测试要证明二者不会出现“列已推进、子资源缺失”或 GET 返回旧状态。

### 10.3 浏览器恢复

- 浏览器只在 `sessionStorage` 保存当前 `workflowId`，以及创建响应尚未成功接收时的 `pendingCreate`；不保存图片、raw OCR、比赛、市场或 API Key。`pendingCreate` 只含 idempotency key 与规范化 create metadata：来源声明/政策版本、content type、byte size、width、height，不含文件名或图片内容。
- 应用启动时调用 `GET /api/ocr/workflows/{workflowId}`。
- 返回 workflow aggregate 及当前 OCR draft、确认快照、报告和方案的可用摘要。
- Pinia 根据服务端响应一次性 hydrate，不能把旧内存值覆盖服务端状态。
- workflow 不存在时清除失效 ID，并显示“开始新流程”。
- 创建请求发出前先原子保存完整 `pendingCreate={idempotencyKey, request}`；若响应丢失或页面刷新，使用保存的同一 key 和完全相同的规范化 request 重放 create，取得同一个 workflow ID 后整体删除 pendingCreate。不得重新从已经丢失的 File 推断请求，也不得因响应丢失创建第二个 workflow。
- 若阶段为 `WAITING_LOCAL_OCR`，因图片未持久化，页面要求重新选择图片。
- v0.2.0 不提供无认证的“列出所有 OCR 工作流”接口；跨会话历史浏览推迟到有明确本地/认证边界的后续版本。

恢复只能由服务端生成并持久化的随机 `workflowId` 完成，不提供“恢复最新工作流”。因此在没有账号隔离的本地单用户版本中，不会因多个浏览器标签或多个工作流而猜错目标。新的标签页没有对应 `sessionStorage` ID 时显示开始页；用户可通过本地保存的 workflow URL 手工打开指定 ID，但该 URL 不是访问控制凭据。

恢复路由必须把 `workflowId` 放在 URL path/query 中。优先级固定为：显式 URL ID > 当前标签页 `sessionStorage` ID > 空状态；显式 ID 404 时显示错误和“开始新流程”，不得静默回退到 sessionStorage 或固定 demo。两个标签页使用两个 URL ID 时，各自读写自己的 workflow；直接打开确认、分析或方案深链时，先按 workflow aggregate 校验子资源确实属于该 workflow。

正式业务路由统一为 `/workflows/:workflowId/...`，至少覆盖 OCR Review、Match Workspace、Analysis 和 Plans；plan detail 另带 `:planId`。旧静态路由只能跳转到当前标签页已有 workflow，或显示空状态。Pinia 收敛为一个 `workflowStore`，显式区分 `IDLE/LOADING/READY/ERROR`，以 aggregate 的 stage/version/current IDs 为真相；其他 store 只是按 ID 的实体缓存。当前 plan 和历史计划的展示不得依赖内存中是否还存在 report 对象。

### 10.4 写操作幂等与崩溃恢复

下列端点必须要求 `Idempotency-Key` 请求头，值为客户端生成的 UUID：创建 workflow、提交/替换 OCR、保存 draft、Confirm、生成分析、生成方案、保存方案和放弃未确认 workflow。服务端在解析成功并通过未知字段检查后，按规范化请求计算 SHA-256；HTTP method、URL path、关键父资源 ID、预期 revision/version 和经过 DTO 规范化、确定字段顺序的业务 JSON 都进入哈希，不能直接 hash 原始 JSON 字节。

持久化规则：

- 相同 key、相同 operation type、相同 request hash：成功后返回同一个资源；不得再次执行业务逻辑或 LLM 调用；
- 相同 key 但 operation type 或 request hash 不同：HTTP 409 `IDEMPOTENCY_KEY_REUSED`；
- 第一个请求仍为 `IN_PROGRESS`：并发请求返回 HTTP 409 `OPERATION_IN_PROGRESS`，客户端稍后用同一 key 查询/重试；
- 已记录为 `FAILED` 或 `INTERRUPTED`：同一 key 返回稳定错误，不隐式重跑；用户确认后使用新 key 重试，且服务端仍重新检查当前状态；
- 对已有最终资源的重复转换，即使换了 key，也不能创建第二份；各端点使用新 key 重做已完成动作的确定语义见下表；
- 服务端重启后记录仍在数据库，不能靠 JVM 内存、Pinia 状态或按钮 disabled 实现幂等。

请求在 JSON schema、UUID 格式和未知字段检查失败时尚未预约 operation，可修正后重新使用该 key；一旦 operation 已预约，后续业务校验或 Provider 失败都写入稳定状态。同 key 的 `FAILED`/`INTERRUPTED` 不可复用。v0.2.0 不自动清理 `workflow_operation`；记录至少与其 workflow 和结果资源同寿命，后续若增加清理策略必须另做迁移与重放窗口规格。对 LLM 分析，相同幂等请求只允许一次 Provider 调用和一条成功 invocation audit。

| 端点 | 使用新 key 重做已完成动作 |
|---|---|
| create workflow | 这是显式新建，创建独立 workflow；丢失响应必须用 pending 原 key 恢复 |
| submit OCR | 原 version 已推进则 409；只有当前 version 且显式 `replaceDraft=true` 才创建替代 task |
| save draft | 原 revision 已推进则 409 `DRAFT_REVISION_CONFLICT` |
| Confirm | 409 `WORKFLOW_STATE_CONFLICT`，错误 data 返回 `currentSnapshotId` |
| generate analysis | 409 `ANALYSIS_ALREADY_GENERATED`，错误 data 返回 `currentReportId` |
| generate plan | 409 `PLAN_ALREADY_GENERATED`，错误 data 返回 `currentPlanId` |
| save plan | 已为 `PENDING_RESULT` 时 409，错误 data 返回 `currentPlanId` |
| abandon | 已为 `ABANDONED` 时 409；同原 key 重放仍返回原 204 |

因此只有相同 key 是 HTTP 级幂等重放；新 key 永远不会被悄悄当作旧操作成功。错误中返回已有资源 ID 只用于客户端恢复。plan note 若仍允许修改，必须拆成独立的 revision/PATCH 契约，不得混入 generated-plan 创建命令；v0.2.0 默认把 note 保留到 save plan 命令一次性写入。

纯数据库操作在同一事务中写入 operation 和结果。可能调用外部 LLM 的分析操作先在短事务 A 中插入 operation，并用 CAS 原子占用 workflow 的 `active_operation_type=GENERATE_ANALYSIS` 与 `active_operation_key=<key>`；条件必须同时要求 stage=`CONFIRMED` 且 active operation 为空。两个不同 key 并发时只有一个 CAS 成功，失败者在任何 Provider 调用前返回 409 `OPERATION_IN_PROGRESS`。成功占用者读取冻结快照并提交，随后才调用 Provider，绝不持有数据库长事务。

Analysis Engine 返回结构化结果与待写 audit，不直接落库；成功后由 orchestrator 在一个最终短事务 B 中原子写入 audit、report、workflow currentReport/stage/version、清除 active claim 和 operation `SUCCEEDED`。Provider 错误由另一个短事务写 failure audit、清除 active claim 与 operation `FAILED`，workflow 保持 `CONFIRMED`。若进程崩溃，claim 保持到恢复器把超时 operation 标记 `INTERRUPTED` 并以匹配 key 的 CAS 清除；绝不自动重放可能收费的 Provider 请求。simulate 等不应并发重复的阶段操作复用同一 active claim 机制，业务唯一约束仍作为最终兜底。

## 11. 数据库演进

新增 Flyway `V3` 迁移，原则是旧数据可读、新数据严格：

### 11.1 新表

`ocr_workflow`

- workflow aggregate 和当前阶段索引；
- `workflow_id` 主键；
- `version` 非空；
- current entity ID 可空；
- `active_operation_type`、`active_operation_key` 可空，用于原子声明当前唯一进行中的阶段操作；
- stage/updated_at 索引。

`ocr_review_draft`

- `ocr_task_id` 主键和外键；
- `workflow_id` 外键；
- `revision`；
- `risk_preference`、`budget_amount`、`currency`；
- `matches_json`、`markets_json`；
- `updated_at`。

`workflow_operation`

- `idempotency_key` UUID 主键；
- 可空 `workflow_id`（创建 workflow 时在成功后回填）；
- `operation_type`、`request_sha256`；
- `status`：`IN_PROGRESS`、`SUCCEEDED`、`FAILED`、`INTERRUPTED`；
- 可空 `result_type`、`result_id`、`error_code`；
- 原始成功 `http_status`，用于同键重放时返回相同状态；
- `created_at`、`updated_at`；
- 对 operation type、workflow 和状态建立必要索引。

数据库还必须用唯一约束兜底：每个 v2 workflow 只能有一个确认快照、一个当前分析报告和一个 generated plan；`ocr_task_id + revision` 只能确认一次。应用层先返回清晰业务错误，唯一约束用于处理并发竞态。

现有 v0.1.x `analysis_report.snapshot_id` 和 `simulated_plan.report_id/snapshot_id` 可能存在没有数据库 FK 保护的历史行，V3 不得直接把这些旧列改成非空 FK 而导致升级失败。新增 nullable、仅供 v2 使用的 `authority_snapshot_id`、`authority_report_id` 与 `workflow_id` 列；新写入按实体类型必须填写权威引用，旧行为 NULL。新 v2 权威引用必须有数据库 FK，snapshot/report/plan 分别以 `UNIQUE(workflow_id)` 落实一 workflow 一资源；plan 同时约束 report 与 snapshot 属于同一 workflow。workflow 的 `current_*_id` 为避免循环 FK 可由 service 在同一 CAS 事务内验证。迁移前先盘点旧孤儿行并用 legacy fixture 证明它们保持可读，不能伪造历史 workflow 或因补约束拒绝升级。

### 11.2 现有表新增字段

按需要为 `screenshot_task`、`ocr_task`、`ocr_confirmed_snapshot`、`analysis_report` 和 `simulated_plan` 增加：

- 可空 `workflow_id`，以兼容旧行；
- `authority_version` 或等价字段；
- OCR 引擎版本、语言、处理尺寸和遮挡数量等最小元数据；
- 草稿 revision 和来源声明。
- 将 `simulated_plan_item.odds` 从 `DECIMAL(18,2)` 无损拓宽为 `DECIMAL(18,4)`，与 v0.2 确认赔率契约一致；旧两位小数数据值不变。

新写入行必须由应用层保证 `workflow_id` 非空。旧行的 `authorityVersion` 统一视为 `LEGACY_V1`。

现有 `screenshot_task.file_name` 若仍为非空列，v0.2 新写入使用固定占位值 `local-image`，不得把浏览器原始文件名传给服务端。后续迁移可再移除该兼容列，但本版本不以破坏性表重建换取字段整洁。

新的 OCR payload 使用独立的 `schemaVersion=OCR_CANDIDATE_V2` DTO/serializer，不在原 record 上直接增加必填构造参数。旧 `payload_json` 由 legacy adapter 读取；回归 fixture 必须包含真实 v0.1.x snapshot、report、generated/pending plan、review 和缺少 v2 字段的 JSON。

v2 的单一真相规则固定为：workflow stage/version/current IDs 以结构化列为权威；draft、snapshot 和 report 的不可变领域正文以带 `schemaVersion` 的专用持久化 JSON DTO 为权威，索引列只是同事务生成的投影；plan header 与 `simulated_plan_item` 表是 plan 的权威内容，旧 `payload_json` 只是兼容投影。repository 不得直接把 API response record 当历史持久化格式。每次写入同时更新权威内容和投影，一致性测试必须主动篡改/构造分裂 fixture 并 fail closed，不能让 GET 随读取路径不同返回两套事实。

### 11.3 旧数据策略

- 已保存的旧方案和旧复盘继续可查看。
- 旧确认快照不得用于创建新的 v0.2 分析报告，因为它们缺少服务端权威确认版本。
- UI 对旧记录显示 `LEGACY DEMO`，但不篡改或伪装为新工作流。
- 不删除、不重写旧 payload JSON。
- 旧记录中的 `HANDICAP_WIN_DRAW_LOSS` 等玩法保持只读；复盘仍按既有规则进入 `NEEDS_REVIEW`，不自动转换成 `WIN_DRAW_LOSS`，也不能作为新 v0.2 workflow 的输入。

## 12. API 契约

### 12.1 保留并收紧的端点

- `POST /api/screenshots/tasks`
  - 创建 workflow 和 screenshot task；
  - 只接收来源声明、内容类型、字节数、图片尺寸和政策版本；
  - 不接收文件本体或原始文件名。
- `POST /api/ocr/parse-local-result`
  - 接收本地 OCR 引擎元数据、处理元数据和候选字段；
  - 拒绝 raw image、Data URL、Base64 和完整 raw text。
- `POST /api/analysis/generate`
  - 使用收紧后的白名单请求；
  - 权威比赛和市场全部来自数据库。
- `POST /api/strategies/simulate`
  - 只接受 `reportId`。

以上写端点及 draft/confirm/保存方案/放弃 workflow 端点均要求 `Idempotency-Key`；读取端点不要求。所有受影响的新 DTO 使用 JSR-380 Bean Validation 与 `@Valid`，本次不借机重构无关旧 API。

关键写请求的最小契约固定为：

- create workflow body：`sourceDeclaration`、`sourcePolicyVersion`、`contentType`、`byteSize`、`width`、`height`；
- parse local result body：`schemaVersion`、`workflowId`、`screenshotTaskId`、`expectedWorkflowVersion`、`replaceDraft`、OCR engine/language/processed-size/redaction metadata、`candidateFields`；
- parse 的 `entryMode` 只能为 `OCR_CANDIDATES` 或 `MANUAL_BLANK`：前者要求 OCR engine/outcome metadata 且 candidate fields 可为空；后者要求 `candidateFields=[]`、`ocrOutcome=SKIPPED_BY_USER`，engine/language/confidence/bbox 为空，并明确创建 revision 0 的空白 draft。两者都通过同一幂等和状态转换进入 `WAITING_USER_CONFIRMATION`；人工录入不是伪造 OCR 成功。
- save draft body：`expectedRevision` 及完整 draft 用户字段，不含正式 match/market ID；
- confirm body：仅 `expectedRevision`；
- analysis body：第 9.1 节白名单；
- simulate body：仅 `reportId`；
- save plan body：仅服务端已有 `generatedPlanId` 和允许的用户备注字段；不得重传 plan items。
- abandon body：空；workflow ID 位于 URL，幂等 key 位于 header。

create/parse/confirm/analysis/simulate 首次成功创建资源返回 201；draft update 和 plan state transition 返回 200；同键重放返回 operation 记录中的原始 HTTP 状态及同一资源 ID。GET 返回 200，旧 confirm 入口返回 410。现有 response 的关键业务字段保留，错误统一使用第 13 节契约。

### 12.2 新端点

- `GET /api/ocr/workflows/{workflowId}`：恢复 aggregate；
- `DELETE /api/ocr/workflows/{workflowId}`：仅在未确认阶段放弃，清除候选/草稿并保留最小 tombstone；
- `GET /api/ocr/tasks/{ocrTaskId}`：读取当前 OCR task 摘要；
- `PUT /api/ocr/review-drafts/{ocrTaskId}`：按 revision 保存可编辑草稿；
- `POST /api/ocr/review-drafts/{ocrTaskId}/confirm`：确认已保存 revision；
- `GET /api/ocr/snapshots/{snapshotId}`：读取确认快照；
- `GET /api/analysis/reports/{reportId}`：读取分析报告。

旧 `POST /api/ocr/review/confirm` 必须保留为固定 HTTP 410 `LEGACY_CONFIRM_ENDPOINT_REMOVED` 的兼容 tombstone，不解析旧请求正文、不执行业务逻辑。v0.2.0 不采用删除路由这一备选，避免旧客户端得到含糊 404。

### 12.3 精确 JSON 白名单

分析和方案端点不得依赖 Jackson 默认“忽略未知属性”的行为。实现必须对请求顶层字段做精确白名单验证，并用负测试证明：

- 添加 `sourceType`、`analysisAllowed`、`matches` 或 `markets` 会失败；
- 添加 `probabilityAnalysis`、`riskWarnings` 或 `simulatedSelections` 会失败；
- 任意未知嵌套键不会被静默接受；
- 合法请求仍正常工作。

同样的精确白名单适用于 create、parse、draft、confirm 和 save plan；尤其 parse 必须拒绝 `fileName`、`rawText`、`image`、`dataUrl`、`base64` 等字段，confirm 必须拒绝任何 matches/markets 正文。

候选与草稿 API 另有固定资源上限：HTTP body 最大 512 KiB；candidate fields 最多 256 个；最终 matches 为 1 至 64 个且 market 数与之相等；单个候选值最多 512 字符；每个候选最多一个 bbox；不接受自由形态嵌套 Map。processed width/height、rotation、crop transform version 和坐标空间必须与 bbox 一起保存，否则 bbox 只留浏览器会话、不发服务端。超限返回 413 或稳定 400/422，不得 500。

## 13. 错误处理

### 13.1 统一响应

保留现有 `code/msg/data` 兼容字段，并增加可选错误对象：

```json
{
  "code": 409,
  "msg": "OCR draft revision changed.",
  "data": null,
  "error": {
    "errorCode": "DRAFT_REVISION_CONFLICT",
    "fieldErrors": [],
    "traceId": "..."
  }
}
```

新增 `@RestControllerAdvice` 或等价统一处理，确保前端不需要解析 Spring 默认 HTML/JSON 错误格式。新增 `error` 字段采用 `NON_NULL` 序列化，因此成功响应仍保持现有 `code/msg/data` 三字段形状。

### 13.2 HTTP 与错误码

- 400：格式、未知属性、范围错误；
- 404：workflow/task/snapshot/report 不存在；
- 409：状态、revision、父子关系冲突；
- 413：候选/草稿请求体超过固定上限；
- 422：草稿结构完整但业务语义不允许确认；
- 502：可选 LLM Provider 失败，规则引擎路径不受影响。

至少定义：

- `UNSUPPORTED_IMAGE_TYPE`
- `IMAGE_TOO_LARGE`
- `IMAGE_DECODE_FAILED`
- `OCR_ASSET_UNAVAILABLE`
- `OCR_WORKER_FAILED`
- `OCR_CANCELLED`
- `OCR_NO_TEXT_DETECTED`
- `WORKFLOW_NOT_FOUND`
- `WORKFLOW_STATE_CONFLICT`
- `WORKFLOW_ABANDONED`
- `DRAFT_REVISION_CONFLICT`
- `DRAFT_VALIDATION_FAILED`
- `UNSUPPORTED_PLAY_TYPE`
- `SNAPSHOT_NOT_CONFIRMED`
- `LEGACY_SNAPSHOT_NOT_ANALYZABLE`
- `CLIENT_ASSERTED_AUTHORITY_NOT_ALLOWED`
- `INVALID_ANALYSIS_ENGINE_CONFIGURATION`
- `REPORT_NOT_FOUND`
- `REPORT_STATE_CONFLICT`
- `ANALYSIS_ALREADY_GENERATED`
- `PLAN_ALREADY_GENERATED`
- `CLIENT_ASSERTED_REPORT_NOT_ALLOWED`
- `LEGACY_CONFIRM_ENDPOINT_REMOVED`
- `IDEMPOTENCY_KEY_MISSING`
- `IDEMPOTENCY_KEY_INVALID`
- `IDEMPOTENCY_KEY_REUSED`
- `OPERATION_IN_PROGRESS`
- `OPERATION_PREVIOUSLY_FAILED`
- `OPERATION_INTERRUPTED`
- `REQUEST_TOO_LARGE`

### 13.3 日志边界

结构化日志可以记录：

- `traceId`
- `workflowId`
- task/snapshot/report/plan ID
- 状态转换
- OCR 耗时区间和失败代码

日志不得记录：

- 原始或处理后图片；
- Data URL/Base64；
- 完整 OCR 文本；
- 比赛/市场用户输入正文；
- API Key、Prompt 或 LLM 完整输出。

## 14. 前端交互

### 14.1 Screenshot Upload

页面在现有布局内增加：

- 来源声明选择；
- 文件类型、大小和尺寸状态；
- 图片预览；
- 左/右旋转；
- 裁剪区域；
- 添加/清除遮挡区域；
- OCR 语言提示；
- 真实进度、取消、重试；
- “识别后进入确认”和“跳过 OCR 手工录入”。

页面必须明确显示：

> 图片仅在当前浏览器内处理。服务端不会接收原图、完整 OCR 文本或逐词结果；结构化候选字段会保存到本机后端供您刷新恢复，只有您确认后的快照才能进入模拟分析。

### 14.2 OCR Review

页面改为真正表单：

- OCR 候选和最终值分离展示；
- 低置信度字段有视觉提示，但不得自动判定错误；
- 比赛和市场为可增删的表格/卡片；
- 每个市场明确选择其比赛；
- 保存草稿和确认快照是两个动作；
- 字段错误定位到具体比赛、市场和字段；
- revision 冲突时重新加载服务端草稿，不覆盖用户未提交内容，先给出冲突提示。

### 14.3 恢复与导航

- 应用启动后先 hydrate，再决定页面空态；
- 路由访问不合法阶段时显示当前阶段和正确下一步，不自动伪造缺失数据；
- Dashboard 的状态来自 workflow aggregate；
- confirmed snapshot 和 report detail 可在刷新后重新获取。

## 15. 隐私、安全与合规

### 15.1 网络边界

- 图片处理期间允许的请求目标只有应用同源 OCR 资产和本地 API；
- 浏览器真实测试拦截并拒绝外部网络请求；
- OCR 不调用 OpenAI-compatible Provider；只有用户确认后且在分析页显式选择时才可能调用 LLM；
- 服务端 OCR 永久保持关闭。
- 所有非同源请求在真实 OCR 测试中直接 abort 并使测试失败；禁止资产 404 后回退到 Tesseract 默认 CDN。
- 浏览器 API 一律使用相对路径 `/api`。开发环境由 Vite proxy 转发，生产/发行构建由同源反向代理或同一站点提供；新页面不得直接 fetch `127.0.0.1:8080`。v0.2 新端点不依赖 CORS 才能工作。若为旧入口暂留本地跨源开发配置，只允许明确的 localhost origin，并完整覆盖实际方法/header（包括 PUT、DELETE、`Idempotency-Key`、`Content-Type`、trace header）；不得使用通配 origin。

### 15.2 存储边界

- 图片和 raw OCR 不进入 H2、MySQL 示例、日志、审计表、浏览器 LocalStorage 或仓库；
- `sessionStorage` 只存 workflow ID 和短期 `pendingCreate` 的非敏感 create metadata/idempotency key；
- 已确认结构化字段按现有本地数据库策略持久化；
- OCR 候选和草稿被视为可能敏感，不写日志。
- 公共 OCR 模型可按带版本路径缓存在 IndexedDB；任何用户派生数据不得进入浏览器持久缓存。
- 用户可在确认前执行“放弃并删除工作流”：事务内清除该 workflow 的候选、draft、task payload 与可能包含用户内容的字段，并把 workflow 改为最小 `ABANDONED` tombstone；只保留 workflow ID、状态、时间和幂等操作的 key/hash/result 状态以保证删除请求可重放，不保留用户正文。已确认及其下游记录因审计/复盘完整性不提供该删除入口。隐私文档必须说明该本地保留边界。

### 15.3 内容边界

- 页面、README 和样例继续使用 `DEMO DATA / FICTIONAL SAMPLE`；
- 不将 OCR 结果发布为官方数据；
- 不增加准确率、盈利、中奖或回本承诺；
- 不把 LLM 作为规则结算替代品；
- 合规扫描新增对图片/Base64、远程 OCR URL 和官方截图资产的针对性检查。

### 15.4 玩法白名单边界

`WIN_DRAW_LOSS` 和 `HOME_WIN`/`DRAW`/`AWAY_WIN` 的白名单必须分别在以下位置独立执行，不能只依赖确认页下拉框：Review Draft 最终确认、快照到 Analysis DTO 的服务端转换、策略默认值与策略参数校验、LLM 输出校验、generated plan 保存以及复盘规则入口。任一层看到其他玩法都返回稳定错误或对旧只读记录进入 `NEEDS_REVIEW`，不得静默降级或自动映射。

## 16. 兼容性

### 16.1 数据兼容

- Flyway 迁移必须在现有 v0.1.x H2 文件库上通过；
- 已保存模拟方案和复盘记录保持可读；
- 旧确认快照只读，不可启动新的 v0.2 分析；
- 不要求用户删除本地数据库。
- 旧 `HANDICAP_WIN_DRAW_LOSS` 方案只读展示并按既有规则复盘，不写回、不转换；新的策略默认值、允许列表和 LLM 输出只允许 v0.2 白名单。
- 不修改已经发布的 V1/V2 migration；用从 v0.1.x 结构和 payload 提取的脱敏 fixture 执行 V3 升级测试，而不只测试空数据库。

### 16.2 API 兼容

- URL 尽量保留，权限边界优先于旧请求体兼容；
- 旧分析/模拟请求中的客户端权威字段明确失败，不静默忽略；
- 前后端在同一 Release 中同步升级；
- README 明确 v0.2.0 收紧了内部实验 API，尚不承诺公共稳定 API。
- root `package.json`、`package-lock.json`、web `package.json`、server `pom.xml`/artifact version 以及公开文档同步到 `0.2.0`（Maven 开发构建可使用 `0.2.0-SNAPSHOT`，发布候选前再统一）。

### 16.3 浏览器兼容

首要支持与现有 CI 一致的 Chromium。Firefox/Safari 不作为 v0.2.0 阻断门禁，但纯 OCR Core 不得使用 Chromium 专有类型。遇到不支持的 Canvas/ImageBitmap 能力时显示明确错误并允许人工录入。

## 17. 测试策略

### 17.1 OCR Core 单元测试

- 文件策略、尺寸限制和 MIME 判定；
- crop/rotate/redaction 几何；
- bounding box 变换；
- confidence 归一化；
- 候选字段白名单；
- 多比赛/市场候选映射；
- 无法映射时返回空草稿而非伪造字段。
- run token 的 late-result 丢弃、取消/换图/unmount 清理和连续任务无 Worker 泄漏。

### 17.2 Vue/Vitest

- 来源声明未确认时不能启动 OCR；
- 不支持格式和超限图片提示；
- 进度、取消、重试和人工录入降级；
- 多比赛及逐场单一选择的增删改；
- 删除被引用比赛的冲突提示；
- revision 冲突处理；
- hydrate 不覆盖更新的服务端状态；
- API payload 不包含 File、Data URL、Base64 或 raw text。
- 不允许 runtime CDN fallback；语言/core 404、WASM 不支持、IndexedDB 禁用、空结果和低置信度结果都进入明确重试/人工录入路径。

Canvas/Tesseract 在 Vitest 中使用 Adapter fake；真实 OCR 留给浏览器测试，不在 jsdom 里伪装成功。

### 17.3 Spring Boot

- DTO 字段和嵌套字段校验；
- null、空数组、重复 draft ID、孤儿引用、顺序保持、字符串规范化、日期/时区、金额精度和 odds 边界；
- workflow 状态机合法/非法转换；
- 每一个非法跳级、回退、重复推进及父资源不存在的 404/409 边界；
- draft optimistic lock；
- Confirm 事务和幂等；
- 相同幂等键相同请求、相同键不同请求、并发请求、重启后重试、卡住 operation 中断处理；
- 服务端生成 match/market ID；
- snapshot 不可变；
- analysis 按 snapshotId 加载权威数据；
- legacy/tampered/unknown 字段负测试；
- strategy 参数与快照预算/风险不一致时失败；
- simulate 按 reportId 加载报告且重复请求幂等；
- 旧 H2 数据迁移后仍可读取计划和复盘；
- 真实 v0.1.x payload JSON 缺少 v2 字段时仍能反序列化；旧非 WDL 记录明确只读/needs-review；
- 应用重启后 workflow detail 可恢复。
- Review、Analysis、策略默认、LLM 输出、Plan 和 Review 六个入口的玩法白名单。

### 17.4 Playwright 黄金流程

仓库新增一张没有第三方权利问题的虚构 PNG，包含固定英文和简体中文文本。真实浏览器测试必须：

1. 选择虚构样例；
2. 验证图片预览；
3. 添加遮挡并真实运行 Tesseract.js；
4. 验证识别结果包含稳定的关键 token，不锁定不稳定的完整文本或精确 confidence；
5. 编辑为至少两场比赛，并为每场比赛保留恰好一个已选方向及赔率；
6. 保存草稿并刷新；
7. 从服务端恢复草稿，随后停止并重启本次测试启动的后端进程，再次以同一 workflow ID 恢复；
8. 确认快照；
9. 生成规则分析；
10. 生成并保存模拟方案；
11. 验证整个过程中没有图片请求发往 API，也没有外部网络请求。

浏览器网络断言必须检查全部写请求的 header/body：不得出现 multipart 图片、`data:image`、PNG/JPEG/WebP Base64 特征、`rawText` 或黄金图片原始文件名。数据库断言必须证明新 `ocr_task.raw_text IS NULL`，相关 `payload_json` 不含黄金图片全文、文件名或图片编码。测试只对稳定双语 token 和结构化映射做断言，不锁完整 OCR 文本或精确 confidence。

隐私黄金图另包含一个只会出现在完整 raw OCR、不会被候选映射的唯一 sentinel。测试结束后必须扫描：全部请求 URL/query/header/body、浏览器 console、后端 stdout/stderr 与日志文件、H2 所有相关表和 audit、Playwright trace/video/screenshot/失败附件、LocalStorage、Cache Storage 以及 IndexedDB 的 database/store/key/value。sentinel 与原始文件名在上述位置必须均为零命中；IndexedDB 只允许 manifest 中已知版本的公共 traineddata cache，sessionStorage 只允许 workflow ID 与短期 `pendingCreate` 非敏感 metadata。敏感流程默认关闭 trace/video/screenshot；失败诊断必须先清除 OCR raw UI 再生成脱敏附件，且最终仍执行扫描。

真实 Chromium 还必须验证公共模型缓存：持久 profile 的冷运行从同源各获取一次 `eng`/`chi_sim`，暖运行不再下载语言模型；Cache Storage/LocalStorage 不出现用户派生数据；IndexedDB 被禁用但模型已经载入内存时，本次 OCR 仍能完成。

Stage 9 runner 必须先构建当前 checkout 的前后端产物，再使用随机空闲端口和测试专属临时 H2 文件目录启动这些产物。它不得连接或复用机器上既有的 8080/5173 进程，也不得使用开发者日常数据库。测试记录自身启动的 PID 并在 `finally` 清理；后端重启必须复用同一临时 H2 文件以证明进程级恢复，而不是只证明 Pinia hydrate。测试还要校验当前构建的版本/健康标识，防止误连旧服务造成假绿。

现有 Stage 8 脚本虽然保留命令入口，但其 smoke 启动逻辑必须同步改为可注入隔离端口/临时数据库且禁止复用未知进程；Stage 9 不能在内部调用一个仍可能误连旧 8080/5173 的旧 smoke。生产静态服务器必须为 `createWebHistory` 深链提供 SPA fallback，并由 Playwright 直接 `page.goto(/workflows/:id/...)` 验证，而不只通过应用内导航。

另有负流程：

- 直接构造带 `matches`/`analysisAllowed` 的分析请求返回 400；
- 使用不存在、legacy 或未确认 snapshot 返回 404/409；
- 方案请求附加报告内容返回 400；
- OCR 资产加载失败时显示人工录入选项。
- 同一幂等键并发提交只产生一个资源；相同键替换 payload 返回 409。
- 同一场比赛提交两个 selection 返回 422，未被规则引擎错误共享概率。
- 两个不同 key 并发确认同一 revision，最终仍只有一个 snapshot；LLM 同键重放没有第二次 Provider 调用或成功 audit。
- 两个标签页用不同 URL workflow ID 时互不覆盖；无效显式 URL ID 不回退到另一个 workflow。
- 人为延迟 Worker/语言资产初始化和 `recognize()`：分别在初始化中、识别中执行取消、换图和路由离开/unmount，证明旧 Worker 最终 terminate、旧 token 不更新 UI/Pinia/parse API；随后重试只创建一个新 Worker并成功，连续多轮后活动 Worker 数不增长。

### 17.5 CI 门禁

新增 `verify:stage9`，在现有 Stage 8 基础上增加：

- OCR Core tests；
- OCR 同源资产与许可证检查，包括实际复制资产与 manifest 的 SHA-256/字节数、直接/传递运行时依赖和 NOTICE/第三方清单；
- 新的服务端状态机/谱系测试；
- 真实本地 OCR Playwright smoke；
- 外部网络零请求断言；
- 完整 compliance scan、前端类型检查、Vitest/build、Maven verify 和既有 Stage 8 smoke。

GitHub Actions 在 PR 和 `main` push 上执行 `verify:stage9`。Stage 8 脚本继续保留，避免历史基线消失。

## 18. 验收标准

Release v0.2.0 只有同时满足以下条件才算完成：

1. 虚构 PNG 经真实 Tesseract.js Worker 得到可见 OCR 结果；没有硬编码结果替代。
2. 用户图片、Data URL、Base64 和完整 raw OCR 从未进入后端请求、数据库或日志。
3. OCR Worker、Core、英文和简体中文语言资产全部同源加载，测试期间无外部网络请求。
4. OCR 资产版本、字节数、SHA-256 与许可证清单一致；公共模型缓存之外没有用户派生数据进入浏览器持久存储。
5. 用户可以编辑至少两场比赛和多个关联市场。
6. 每场比赛恰好一个已选方向及赔率；只有 `WIN_DRAW_LOSS` 和三种合法 selection 可确认。
7. 保存草稿、刷新页面后，可以从服务端恢复到同一 revision。
8. Confirm 根据服务端草稿生成不可变快照；重复、并发和服务端重启后的同键重试不重复创建。
9. 分析服务忽略不了、也接受不了客户端伪造的 source/matches/markets；必须从数据库加载。
10. 方案服务只按 `reportId` 使用已保存报告；客户端不能替换概率或选择项。
11. 旧计划和复盘记录仍可读取，旧快照不能生成新的 v0.2 报告。
12. 所有新错误都有稳定 errorCode 和可操作中文提示，日志没有敏感正文。
13. `verify:stage9`、`git diff --check` 和 compliance scan 全部通过。
14. README、隐私、合规、OCR 流程、架构和第三方许可文档与实现一致。
15. 不创建 Release，不将维护者/Codex 活动描述为外部采用或外部贡献。
16. Stage 9 只运行当前 checkout 构建出的服务，使用随机端口和临时数据库，并通过一次真实后端重启恢复同一 workflow。
17. root/web/server/lockfile 版本一致；v0.1.x H2 与真实旧 JSON fixture 原地迁移后仍可读取旧方案和复盘。

## 19. 实现拆分边界

详细实现计划在本规格获批后单独编写。计划必须按可验证的原子任务拆分，至少保持以下顺序：

1. OCR Core 契约、同源资产和真实黄金图片；
2. 浏览器图片工作副本与 Tesseract Adapter；
3. 可编辑 Review Draft 与前端验证；
4. Flyway workflow/draft 数据模型和恢复 API；
5. Confirm 事务与不可变 v2 snapshot；
6. Analysis 的服务端权威加载；
7. Simulated Plan 的服务端权威加载；
8. Pinia hydrate、Dashboard 导航与完整黄金流程；
9. Stage 9 门禁、文档、许可证和发布前审计。

每个原子任务都必须先增加能证明旧行为不满足要求的测试，再实现并运行定向验证。不得并行修改同一核心文件，不得在没有真实浏览器证据时宣称 OCR 可用。

## 20. 后续版本接口

本设计为 v0.3.0 预留但不实现：

- `DataProvider` / `FeaturePipeline` / `Predictor` / `Evaluator` SPI；
- `data_snapshot` 来源、许可、SHA-256 和父快照；
- `prediction_run`、参数、随机种子、Git commit 和 artifact manifest；
- Elo/Poisson/Dixon-Coles 透明统计基线；
- Walk-forward、Brier、RPS、Log Loss、ECE 和校准图；
- 本地 JSON/CSV Provider；
- 数据驱动 Strategy Lab 和只追加公开 track record。

这些能力不得反向削弱 v0.2.0 的人工确认、原图不上行、不可变快照和服务端权威边界。
