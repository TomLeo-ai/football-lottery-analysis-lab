# 官方外链入口规范

OfficialSourceHub 只维护外部链接、用途说明和非官方声明。

## 实现规则

- 链接必须使用 `target="_blank"` 和 `rel="noopener noreferrer"`。
- 禁止使用 iframe、webview 或页面镜像方式展示官方页面。
- 禁止抓取、缓存或展示官方页面中的具体赛程、赔率、玩法、赛果、开奖数据。
- 链接数据结构只允许包含名称、URL、用途说明、地区、非官方声明和更新时间。

## 当前 API

```text
GET /api/official-links
```

该接口只返回外链元数据和合规说明，不返回官方页面正文、赛事、赔率、玩法、赛果或开奖数据。

## 当前页面

```text
/official-source-hub
```

页面以表格展示外链元数据，并提供加载、空状态、错误状态和重试路径。

## 推荐字段

```json
{
  "id": "official-link-demo",
  "name": "External Official Information Entry",
  "url": "https://example.com",
  "purpose": "External reference only. No data is copied into this project.",
  "region": "DEMO",
  "nonOfficialNotice": "Non-official external link. Simulation-only project.",
  "updatedAt": "2026-06-25T00:00:00+08:00"
}
```

## 验证点

- 页面中不存在 iframe。
- 页面中不出现官方具体赛事数据。
- 所有外链都有安全属性。
