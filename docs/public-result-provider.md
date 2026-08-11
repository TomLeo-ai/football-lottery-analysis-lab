# PublicResultProvider 规范

PublicResultProvider 是公开赛果源抽象，不是官方彩票数据抓取器。

## 允许来源

- 合规公开体育比分源。
- 赛事官网公开比分。
- 用户自配并确认授权的 API。
- Mock 赛果源。

## 禁止来源

- 禁止默认接入中国竞彩网或中国体育彩票页面。
- 禁止抓取、缓存、镜像或再发布官方彩票页面数据。
- 禁止绕过验证码、反爬、安全策略或风控。

## 赛果字段

每条赛果必须记录：

- `sourceName`
- `sourceUrl`
- `sourceLicense`
- `fetchedAt`
- `confidence`

## 阶段 6-7 已实现能力

当前实现 Mock 公开赛果源与复盘匹配：

```text
POST /api/result-providers/sync
GET  /api/result-providers/status
GET  /api/reviews/pending
POST /api/simulated-plans/{planId}/match-result
POST /api/simulated-plans/{planId}/settle
GET  /api/simulated-plans/{planId}/review
```

`POST /api/result-providers/sync` 会生成虚构公开赛果快照，并返回来源元数据、同步状态和快照列表。

`GET /api/result-providers/status` 返回最近一次同步状态。初始状态为 `IDLE`；同步后为 `SYNCED`。

当前 Mock 快照包含：

- `sourceName`: `Mock Public Result Provider`
- `sourceUrl`: `https://example.com/mock-public-results`
- `sourceLicense`: `Fictional sample for local tests only`
- `fetchedAt`: 服务端同步时间
- `confidence`: `0.98`

Stage 7 会把已保存且状态为 `PENDING_RESULT` 的模拟方案与 Mock 赛果快照进行匹配。匹配成功后生成复盘记录，输出命中状态、失败原因、策略修正规则和来源元数据。

## 匹配策略

按比赛日期、联赛、主队、客队、开赛时间进行匹配。置信度不足、来源冲突、比赛延期或取消时不能误结算，必须进入人工确认或保持待处理。
