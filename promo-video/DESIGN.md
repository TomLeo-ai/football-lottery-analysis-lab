# 足彩分析实验室产品广告片重做方案

## 功能说明

本版按用户反馈重新制作：文字全部改成中文，画面主体使用真实产品页面截图，不再使用技术图表、流程方框或手绘仪表盘元素。广告片定位为“开源产品宣传片”，核心视觉是产品界面本身，通过镜头推拉、近景切换和少量中文广告字幕表达卖点。

核心广告语：

```text
把每一次判断，变成可复盘的实验。
```

边界文案：

```text
非官方 · 仅模拟分析/复盘 · 开源研究工具
```

## 核心镜头

| 时间 | 画面 | 中文文案 |
| --- | --- | --- |
| 0-7s | 产品仪表盘截图全屏推进 | 把零散判断，放进一套闭环工作台 |
| 7-15s | 截图 OCR 页面与已解析状态 | 从截图开始，先确认，再分析 |
| 15-23s | 人工确认页面近景 | 未确认的信息，不进入后续判断 |
| 23-34s | 策略分析页面推进 | 规则引擎先跑起来，模型只做可审计辅助 |
| 34-45s | 复盘中心页面推进 | 赛果回来后，系统帮你复盘当时的假设 |
| 45-53s | 模型设置与合规守卫页面 | 能力可配置，边界始终清楚 |
| 53-58s | 多张产品截图快速蒙太奇 | 足彩分析实验室：构建、模拟、复盘 |

## 素材

截图素材由 `promo-video/scripts/capture-product-screenshots.mjs` 从本地 Vue 产品页面自动生成，并在截图阶段做中文化处理：

- `promo-video/assets/screens/dashboard.png`
- `promo-video/assets/screens/screenshot-upload-active.png`
- `promo-video/assets/screens/ocr-review.png`
- `promo-video/assets/screens/strategy-simulator.png`
- `promo-video/assets/screens/review-center.png`
- `promo-video/assets/screens/model-settings.png`

## 技术实现

- 工具：HyperFrames + GSAP
- 尺寸：1920 x 1080
- 时长：58 秒
- 项目入口：`promo-video/index.html`
- 截图脚本：`node promo-video/scripts/capture-product-screenshots.mjs`
- 预览：`npm run dev`，端口 `3017`
- 校验：`npm run check`
- 渲染：用户确认预览后再执行 `npm run render`

## 注意事项

- 产品截图素材仅用于宣传片画面，不修改产品源码文案。
- 广告文案保持非官方、模拟分析/复盘、开源研究工具边界。
- 不表达交易诱导、确定性结果或官方背书。
