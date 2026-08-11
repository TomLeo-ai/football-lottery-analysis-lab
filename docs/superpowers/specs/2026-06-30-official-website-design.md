# Football Lottery Analysis Lab 官方网站设计概要

## 核心功能

1. 将 `/` 根路径作为公开官方网站首页，`/dashboard` 保持现有产品工作台。
2. 首屏展示产品名、核心广告语、非官方模拟复盘边界和两个入口按钮。
3. 用真实产品截图展示 OCR、规则分析、模拟方案、赛后复盘和模型设置能力。
4. 用单页区块说明闭环流程、功能特点和合规边界。

## 主要文件

- `apps/web/src/views/MarketingHome.vue` - 官网单页组件。
- `apps/web/src/router/index.ts` - 将 `/` 改为官网首页路由。
- `apps/web/src/App.vue` - 官网路由不显示控制台壳层，其他路由保持原工作台壳层。
- `apps/web/src/assets/main.css` - 新增官网专用赛博科技风样式。
- `apps/web/public/product-screens/` - 存放官网引用的真实产品截图。

## 技术与视觉

- 技术栈沿用 Vue3、Vue Router、Vite、现有 CSS，不新增依赖。
- 视觉采用深色赛博科技风，使用冷色霓虹描边、数据网格、扫描线和产品截图层叠展示。
- 动效使用轻量 CSS，并通过 `prefers-reduced-motion: reduce` 提供降级。

## 合规边界

- 文案必须明确“非官方”“开源研究工具”“仅模拟分析/复盘”。
- LLM 只描述为可审计辅助能力，默认规则引擎仍是权威路径。
- 不展示官方页面截图、官方 Logo、真实官方数据或任何真实 API Key。
- 不出现真实购彩、支付、出票、代购、合买、跟单、充值、提现、中奖保证或收益承诺。

## 验证命令

```shell
npm --prefix apps/web run test
npm --prefix apps/web run build
npm run compliance:scan
npm run verify:stage8
```
