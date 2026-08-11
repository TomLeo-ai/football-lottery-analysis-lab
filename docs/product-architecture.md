# 产品架构图

本文档描述 Football Lottery Analysis Lab 当前阶段的产品架构、技术架构和核心数据流。项目定位为非官方、开源、模拟分析与赛后复盘实验室，仅支持虚构样例、本地 OCR 确认、模拟方案生成、结果匹配与复盘研究。

## 1. 产品功能架构图

```mermaid
flowchart TB
  user["用户 / 研究者"]

  subgraph web["Web 产品入口（Vue3）"]
    home["首页 / MarketingHome"]
    dashboard["Dashboard 仪表盘"]
    official["OfficialSourceHub 官方外链中心"]
    upload["ScreenshotUpload 截图上传"]
    ocrReview["OcrReviewWizard OCR 人工确认"]
    matchWorkspace["MatchWorkspace 比赛工作台"]
    simulator["StrategySimulator 策略模拟"]
    savedPlans["SavedPlans 已保存方案"]
    reviewCenter["ReviewCenter 复盘中心"]
    strategyLab["StrategyLab 策略实验室"]
    modelSettings["ModelSettings 模型设置"]
    compliancePage["AboutCompliance 合规说明"]
  end

  subgraph capabilities["核心产品能力"]
    boundary["合规边界提示"]
    externalLinks["官方信息外链入口"]
    screenshotFlow["虚构截图上传与本地 OCR"]
    confirmFlow["用户人工确认快照"]
    analysisFlow["规则引擎分析 / 可选 LLM 辅助"]
    planFlow["模拟方案生成与保存"]
    resultFlow["Mock / 合规结果源同步"]
    reviewFlow["结果匹配、结算与复盘归因"]
    modelFlow["OpenAI-compatible Provider 配置"]
  end

  user --> home
  user --> dashboard
  user --> official
  user --> upload
  user --> ocrReview
  user --> matchWorkspace
  user --> simulator
  user --> savedPlans
  user --> reviewCenter
  user --> strategyLab
  user --> modelSettings
  user --> compliancePage

  home --> boundary
  dashboard --> boundary
  official --> externalLinks
  upload --> screenshotFlow
  ocrReview --> confirmFlow
  matchWorkspace --> confirmFlow
  simulator --> analysisFlow
  simulator --> planFlow
  savedPlans --> planFlow
  reviewCenter --> resultFlow
  reviewCenter --> reviewFlow
  strategyLab --> analysisFlow
  modelSettings --> modelFlow
  compliancePage --> boundary

  externalLinks -.->|"仅打开外部链接，不展示官方数据"| boundary
  screenshotFlow --> confirmFlow --> analysisFlow --> planFlow --> resultFlow --> reviewFlow
```

## 2. 前后端技术架构图

```mermaid
flowchart TB
  browser["浏览器"]

  subgraph frontend["前端应用：apps/web"]
    vite["Vite + TypeScript"]
    router["Vue Router"]
    views["页面组件：Dashboard / OCR / Strategy / Review / Model"]
    apiClients["API 模块：analysis / ocrWorkflow / simulatedPlans / reviews / modelProviders"]
    stores["Pinia Store：appStatus / ocrWorkflow / simulatedPlan / resultProvider / analysisReport"]
  end

  subgraph backend["后端应用：apps/server"]
    spring["Spring Boot 3 API"]
    commonResult["统一响应 Result<T>"]

    subgraph controllers["Controller 层"]
      officialController["OfficialLinkController"]
      ocrController["OcrWorkflowController"]
      analysisController["AnalysisController"]
      planController["SimulatedPlanController"]
      resultController["PublicResultProviderController"]
      reviewController["ReviewWorkflowController"]
      modelController["ModelProviderController / EngineSettingsController"]
      strategyController["StrategyParameterDefaultsController"]
    end

    subgraph services["Service / Engine 层"]
      officialService["OfficialLinkService"]
      ocrService["OcrWorkflowService"]
      analysisService["AnalysisService"]
      ruleEngine["MockRuleAnalysisEngine"]
      llmAnalysisEngine["OpenAiCompatibleAnalysisEngine"]
      planService["SimulatedPlanService"]
      resultService["MockPublicResultProviderService"]
      reviewService["ReviewWorkflowService"]
      llmReviewEngine["OpenAiCompatibleReviewInsightEngine"]
      llmRegistry["LlmProviderRegistry / EngineSettingsService"]
      llmAudit["LlmInvocationAuditService"]
      validator["StrategyParameterValidator / LlmOutputValidator / SafetyGuardService"]
    end

    subgraph repositories["Repository 层（JDBC）"]
      ocrRepo["JdbcOcrWorkflowRepository"]
      analysisRepo["JdbcAnalysisReportRepository"]
      planRepo["JdbcSimulatedPlanRepository"]
      resultRepo["JdbcPublicResultSnapshotRepository"]
      reviewRepo["JdbcReviewRecordRepository"]
      auditRepo["JdbcLlmInvocationAuditRepository"]
    end
  end

  subgraph database["数据层"]
    flyway["Flyway Migration"]
    h2["H2 Embedded File DB（默认）"]
    mysql["MySQL 迁移目标（预留）"]
  end

  subgraph external["外部边界"]
    officialSite["官方网站：外链打开"]
    userScreenshot["用户上传 / 虚构截图样例"]
    mockProvider["Mock / 合规公开结果源"]
    llmProvider["OpenAI-compatible LLM Provider"]
    env["后端环境变量：API Key"]
  end

  browser --> frontend
  vite --> router --> views
  views --> apiClients
  views --> stores
  stores --> apiClients

  apiClients -->|"HTTP JSON /api/*"| spring
  spring --> commonResult
  spring --> controllers
  controllers --> services
  services --> repositories
  repositories --> h2
  flyway --> h2
  flyway -.->|"兼容性检查后可迁移"| mysql

  officialController --> officialService
  ocrController --> ocrService
  analysisController --> analysisService
  planController --> planService
  resultController --> resultService
  reviewController --> reviewService
  modelController --> llmRegistry
  strategyController --> validator

  analysisService --> ruleEngine
  analysisService --> llmAnalysisEngine
  reviewService --> llmReviewEngine
  llmAnalysisEngine --> llmRegistry
  llmReviewEngine --> llmRegistry
  llmAnalysisEngine --> llmAudit
  llmReviewEngine --> llmAudit
  llmAudit --> auditRepo

  official -.->|"target=_blank，rel=noopener noreferrer"| officialSite
  upload --> userScreenshot
  resultService --> mockProvider
  llmRegistry --> env
  llmRegistry --> llmProvider
```

## 3. 核心业务闭环数据流图

```mermaid
flowchart LR
  start["开始：用户进入实验室"]
  linkHub["查看官方外链中心"]
  upload["上传虚构截图 / 使用样例"]
  parse["本地 OCR 或 Mock OCR 解析"]
  review["人工校对并确认字段"]
  snapshot["生成 USER_SCREENSHOT_CONFIRMED 快照"]
  analysis["生成分析报告"]
  simulate["生成模拟方案"]
  save["保存不可变方案快照"]
  sync["同步 Mock / 合规结果快照"]
  match["方案与结果匹配"]
  settle["规则引擎结算"]
  postReview["生成复盘记录、失败原因和策略修正规则"]
  endNode["结束：形成可回放复盘闭环"]

  subgraph storage["持久化表"]
    screenshotTask["screenshot_task"]
    ocrTask["ocr_task"]
    confirmedSnapshot["ocr_confirmed_snapshot"]
    analysisReport["analysis_report"]
    simulatedPlan["simulated_plan / simulated_plan_item"]
    publicResult["public_result_snapshot"]
    reviewRecord["review_record"]
    llmAuditTable["llm_invocation_audit"]
  end

  start --> linkHub
  linkHub -.->|"仅外链跳转，不抓取、不缓存、不镜像官方数据"| upload
  upload --> screenshotTask
  upload --> parse
  parse --> ocrTask
  parse --> review
  review --> snapshot
  snapshot --> confirmedSnapshot
  snapshot --> analysis

  analysis --> analysisReport
  analysis -.->|"可选 LLM 辅助时记录审计元数据"| llmAuditTable
  analysis --> simulate
  simulate --> save
  save --> simulatedPlan
  save --> sync
  sync --> publicResult
  sync --> match
  match --> settle
  settle --> postReview
  postReview --> reviewRecord
  postReview -.->|"可选 LLM 复盘洞察只做辅助，不替代规则结算"| llmAuditTable
  postReview --> endNode
```

## 4. 本地运行架构

```mermaid
flowchart TB
  dev["本地开发者"]
  webCmd["npm run dev:web"]
  serverCmd["mvn -f apps/server/pom.xml spring-boot:run"]
  webPort["前端：http://127.0.0.1:5173"]
  apiPort["后端：http://127.0.0.1:8080"]
  h2Console["H2 Console：http://127.0.0.1:8080/h2-console"]
  dataDir["apps/server/data/football_lottery_analysis_lab.mv.db"]
  verify["npm run verify:stage8"]

  dev --> webCmd --> webPort
  dev --> serverCmd --> apiPort
  apiPort --> h2Console
  apiPort --> dataDir
  dev --> verify
  verify -->|"合规扫描、前端测试、构建、Maven verify、Stage 8 Smoke"| webPort
  verify --> apiPort
```

## 5. 合规与安全边界

- 项目是非官方实验室，不构成购彩建议、收益承诺或命中保证。
- 不提供真实购彩、支付、出票、代买、合买、跟单、充值、提现等能力。
- 不实现官方数据爬虫、官方页面镜像、官方数据缓存或绕过验证机制。
- 官方信息仅作为外部链接入口，前端使用新窗口打开，不在系统内展示官方数据。
- 赛前输入来自用户上传截图、本地 OCR、Mock OCR 或手工确认，未经用户确认的 OCR 结果不得进入分析与模拟方案生成。
- LLM Provider 是可选能力，API Key 只读取后端环境变量，不返回前端，不写入数据库、日志或测试快照。
- LLM 输出必须经过结构化校验和安全校验；规则引擎仍然是结算与复盘状态的最终依据。
- 本地默认数据库为 H2 Embedded File，Flyway 管理 schema；后续可按 `application-mysql.example.yml` 切换到 MySQL。

## 6. 主要验证入口

```shell
npm run compliance:scan
npm run test:web
npm run build:web
npm run verify:server
npm run verify:stage8
```

`verify:stage8` 是当前完整闭环验证入口，覆盖合规扫描、前端类型与单元测试、前端构建、后端 Maven 验证、配置校验和 Stage 8 API / 浏览器 Smoke 流程。
