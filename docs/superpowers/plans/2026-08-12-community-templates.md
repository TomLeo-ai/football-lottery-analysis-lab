# GitHub Community Contribution Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bilingual, policy-validated GitHub Issue Forms and a pull request template without creating synthetic Issues, adoption claims, or Releases.

**Architecture:** GitHub-native YAML Issue Forms and one Markdown pull request template remain the public interface. A Node ESM validator parses YAML with an exact direct dependency, applies repository-specific structural and evidence-integrity checks, and runs inside the existing Stage 8 gate. Positive contract tests read the real files; negative tests mutate temporary copies and never create GitHub objects.

**Tech Stack:** GitHub Issue Forms, Markdown, Node.js 20+ ESM, `yaml@2.9.0`, `node:test`, `node:assert/strict`, npm, GitHub Actions.

---

## Execution Rules

- Execute tasks in order and stop for maintainer verification after each task.
- Work only on `codex/community-templates`, based on public `main` commit `d4d40974ede7684cfb50ca526776b0573dbf5328`.
- Keep design commit `d91ab7e` and this plan commit in branch history.
- Do not create a test Issue, empty or synthetic Pull Request, adoption claim, tag, or Release.
- Do not count maintainer or Codex activity as external contribution or adoption.
- Use `npm.cmd` in Windows PowerShell.
- Never disable Git SSL verification to work around a transient certificate error.

## File Map

**Create:**

- `.github/ISSUE_TEMPLATE/bug-report.yml` — defect intake.
- `.github/ISSUE_TEMPLATE/feature-request.yml` — compliant capability requests.
- `.github/ISSUE_TEMPLATE/adoption-report.yml` — real-use feedback and optional evidence consent.
- `.github/ISSUE_TEMPLATE/config.yml` — Issue chooser policy and security routing.
- `.github/pull_request_template.md` — default bilingual review contract.
- `scripts/community-templates-check.mjs` — parser and repository-policy validator.
- `scripts/community-templates-check.spec.mjs` — positive and negative tests.

**Modify:**

- `package.json` — direct dependency and verification scripts.
- `package-lock.json` — exact `yaml@2.9.0` lock.
- `scripts/stage8-config.spec.mjs` — protect Stage 8 integration.
- `.github/workflows/compliance.yml` — clarify the unified CI step.

### Task 1: Pin the YAML parser

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Prove the parser is not a direct dependency**

Run:

```powershell
npm.cmd pkg get devDependencies.yaml
```

Expected: `{}` or `null`.

- [ ] **Step 2: Install the exact approved version**

Run:

```powershell
npm.cmd install --save-dev --save-exact yaml@2.9.0
```

Expected: `package.json` contains `"yaml": "2.9.0"`, and `package-lock.json` records it as a direct root development dependency.

- [ ] **Step 3: Verify resolution and lockfile reproducibility**

Run:

```powershell
npm.cmd ls yaml --depth=0
npm.cmd ci --ignore-scripts
```

Expected: `yaml@2.9.0` resolves at the root and both commands exit `0`.

- [ ] **Step 4: Commit dependency metadata**

```powershell
git diff --check
git diff -- package.json package-lock.json
git add -- package.json package-lock.json
git commit -m "build: pin YAML parser for community templates"
```

Expected: the commit contains only dependency metadata.

### Task 2: Add the three Issue Forms and chooser configuration

**Files:**

- Create: `.github/ISSUE_TEMPLATE/bug-report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature-request.yml`
- Create: `.github/ISSUE_TEMPLATE/adoption-report.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `scripts/community-templates-check.spec.mjs`

- [ ] **Step 1: Write the failing Issue Form contract tests**

Create `scripts/community-templates-check.spec.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

async function readRepositoryText(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

async function readRepositoryYaml(relativePath) {
  return YAML.parse(await readRepositoryText(relativePath));
}

function fieldById(form, id) {
  return form.body.find((field) => field.id === id);
}

function assertRequiredField(form, id) {
  const field = fieldById(form, id);
  assert.ok(field, 'missing field ' + id);
  assert.equal(field.validations?.required, true, id + ' must be required');
}

function assertOptionalField(form, id) {
  const field = fieldById(form, id);
  assert.ok(field, 'missing optional field ' + id);
  assert.notEqual(field.validations?.required, true, id + ' must remain optional');
}

function assertRequiredCheckboxGroup(form, id) {
  const field = fieldById(form, id);
  assert.equal(field?.type, 'checkboxes', id + ' must be a checkbox group');
  assert.ok(field.attributes?.options?.length > 0, id + ' must contain options');
  for (const option of field.attributes.options) {
    assert.equal(option.required, true, id + ' options must be required');
  }
}

test('Bug Report form preserves the approved contract', async () => {
  const form = await readRepositoryYaml('.github/ISSUE_TEMPLATE/bug-report.yml');
  assert.match(form.name, /Bug Report/);
  assert.match(form.name, /缺陷报告/);
  assert.equal(form.title, '[Bug]: ');
  for (const id of ['version', 'area', 'environment', 'reproduction', 'expected', 'actual']) {
    assertRequiredField(form, id);
  }
  for (const id of ['frequency', 'logs', 'additional_context']) {
    assertOptionalField(form, id);
  }
  assertRequiredCheckboxGroup(form, 'acknowledgements');
  const source = await readRepositoryText('.github/ISSUE_TEMPLATE/bug-report.yml');
  assert.match(source, /security\/policy/);
  assert.match(source, /API keys/);
  assert.match(source, /official lottery/i);
  assert.match(source, /real betting/i);
});

test('Feature Request form preserves the approved contract', async () => {
  const form = await readRepositoryYaml('.github/ISSUE_TEMPLATE/feature-request.yml');
  assert.match(form.name, /Feature Request/);
  assert.match(form.name, /功能建议/);
  assert.equal(form.title, '[Feature]: ');
  for (const id of ['problem', 'use_case', 'proposed_outcome', 'acceptance_criteria', 'scope_area']) {
    assertRequiredField(form, id);
  }
  for (const id of ['alternatives', 'additional_context']) {
    assertOptionalField(form, id);
  }
  assertRequiredCheckboxGroup(form, 'scope_confirmation');
});

test('Adoption Report keeps Public Evidence Ledger consent optional', async () => {
  const form = await readRepositoryYaml('.github/ISSUE_TEMPLATE/adoption-report.yml');
  assert.match(form.name, /Adoption Report/);
  assert.match(form.name, /使用与采用反馈/);
  assert.equal(form.title, '[Adoption]: ');
  for (const id of ['version', 'relationship', 'environment', 'use_case', 'experience']) {
    assertRequiredField(form, id);
  }
  for (const id of ['limitations', 'public_reference', 'additional_context']) {
    assertOptionalField(form, id);
  }
  assertRequiredCheckboxGroup(form, 'privacy_confirmation');
  assertRequiredCheckboxGroup(form, 'conduct_confirmation');
  const consent = fieldById(form, 'evidence_consent');
  assert.equal(consent?.type, 'checkboxes');
  assert.equal(consent.attributes.options.length, 1);
  assert.notEqual(consent.validations?.required, true);
  assert.notEqual(consent.attributes.options[0].required, true);
});

test('Issue chooser disables blank Issues and routes security reports', async () => {
  const config = await readRepositoryYaml('.github/ISSUE_TEMPLATE/config.yml');
  assert.equal(config.blank_issues_enabled, false);
  assert.deepEqual(config.contact_links, [
    {
      name: 'Security report / 安全漏洞报告',
      url: 'https://github.com/TomLeo-ai/football-lottery-analysis-lab/security/policy',
      about: 'Report vulnerabilities privately through the Security Policy / 请按照安全策略私下报告漏洞'
    }
  ]);
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test scripts/community-templates-check.spec.mjs
```

Expected: four tests fail with `ENOENT` because the four YAML files do not exist.

- [ ] **Step 3: Create the Bug Report form**

Create `.github/ISSUE_TEMPLATE/bug-report.yml`:

```yaml
name: Bug Report / 缺陷报告
description: Report a reproducible problem with sanitized evidence / 报告可复现的问题并提供已脱敏证据
title: "[Bug]: "
body:
  - type: markdown
    attributes:
      value: |
        Search existing Issues first. Security vulnerabilities must follow the [Security Policy](https://github.com/TomLeo-ai/football-lottery-analysis-lab/security/policy) and must not be disclosed publicly.
        Do not submit API keys, tokens, cookies, private data, real betting records, official lottery screenshots, logos, copied assets, or official datasets.

        请先搜索已有 Issues。安全漏洞必须按照[安全策略](https://github.com/TomLeo-ai/football-lottery-analysis-lab/security/policy)报告，不得公开披露。
        请勿提交 API Key、Token、Cookie、私人数据、真实投注记录、官方彩票截图、Logo、复制素材或官方数据集。
  - type: input
    id: version
    attributes:
      label: Project version / 项目版本
      description: Provide a Release, commit SHA, or branch / 请填写 Release、提交 SHA 或分支
      placeholder: "Example / 示例: v0.1.1 or d4d4097"
    validations:
      required: true
  - type: dropdown
    id: area
    attributes:
      label: Affected area / 影响模块
      options:
        - Frontend / 前端
        - Backend / 后端
        - OCR
        - Analysis engine / 分析引擎
        - Simulated plan / 模拟方案
        - Result provider / 赛果同步
        - Review workflow / 复盘流程
        - LLM integration / 大模型集成
        - Documentation / 文档
        - Other / 其他
    validations:
      required: true
  - type: textarea
    id: environment
    attributes:
      label: Environment / 运行环境
      description: Include OS, browser, Node, Java, and relevant database configuration without secrets / 请填写操作系统、浏览器、Node、Java 和必要的数据库配置，但不要包含秘密信息
    validations:
      required: true
  - type: textarea
    id: reproduction
    attributes:
      label: Reproduction steps / 复现步骤
      description: Provide the smallest repeatable sequence / 请提供最小且可重复的操作步骤
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior / 预期行为
      description: Describe the observable correct result / 描述可观察到的正确结果
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual behavior / 实际行为
      description: Describe what actually happened / 描述实际发生的情况
    validations:
      required: true
  - type: dropdown
    id: frequency
    attributes:
      label: Frequency / 出现频率
      options:
        - Every time / 每次出现
        - Intermittent / 偶发
        - First run only / 仅首次运行
        - Unknown / 尚不确定
  - type: textarea
    id: logs
    attributes:
      label: Sanitized logs / 已脱敏日志
      description: Remove credentials, cookies, private paths, and user data before pasting / 粘贴前请删除凭据、Cookie、私人路径和用户数据
      render: shell
  - type: textarea
    id: additional_context
    attributes:
      label: Additional context / 补充信息
      description: Add only information that is safe to publish / 仅添加适合公开的信息
  - type: checkboxes
    id: acknowledgements
    attributes:
      label: Required acknowledgements / 必须确认
      options:
        - label: I searched existing Issues and did not find the same problem. / 我已搜索现有 Issues，未发现相同问题。
          required: true
        - label: I removed API keys, tokens, cookies, private information, and real user data. / 我已删除 API Key、Token、Cookie、私人信息和真实用户数据。
          required: true
        - label: I did not attach official lottery screenshots, logos, copied assets, or official datasets. / 我未上传官方彩票截图、Logo、复制素材或官方数据集。
          required: true
        - label: This report contains no real purchase, payment, ticketing, betting record, profit promise, or winning guarantee. / 本报告不包含真实购买、支付、出票、投注记录、收益承诺或中奖保证。
          required: true
        - label: I agree to follow the Code of Conduct and Contributing guide. / 我同意遵守行为准则和贡献指南。
          required: true
```

- [ ] **Step 4: Create the Feature Request form**

Create `.github/ISSUE_TEMPLATE/feature-request.yml`:

```yaml
name: Feature Request / 功能建议
description: Propose a verifiable improvement within the simulation-only boundary / 在仅模拟边界内提出可验证改进
title: "[Feature]: "
body:
  - type: markdown
    attributes:
      value: |
        Describe the user problem and observable outcome. Keep proposals within research, fictional samples, simulation, and review workflows.
        Do not request real purchase, payment, ticketing, official-data crawling, access-control bypass, profit promises, or winning guarantees.

        请描述用户问题和可观察结果。建议必须限定在研究、虚构样例、模拟和复盘流程内。
        不得要求真实购买、支付、出票、官方数据抓取、绕过访问控制、收益承诺或中奖保证。
  - type: textarea
    id: problem
    attributes:
      label: Problem or need / 问题或需求
      description: Explain the current limitation / 说明当前限制
    validations:
      required: true
  - type: textarea
    id: use_case
    attributes:
      label: Use case / 使用场景
      description: Explain who needs the outcome and in which workflow / 说明谁在什么流程中需要该结果
    validations:
      required: true
  - type: textarea
    id: proposed_outcome
    attributes:
      label: Proposed outcome / 期望结果
      description: Describe the user-visible result without prescribing implementation / 描述用户可见结果，无需规定内部实现
    validations:
      required: true
  - type: textarea
    id: acceptance_criteria
    attributes:
      label: Acceptance criteria / 验收标准
      description: Provide runnable, observable, repeatable conditions / 提供可运行、可观察、可重复的验收条件
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered / 已考虑的替代方案
      description: Describe existing workarounds / 描述现有绕行方法
  - type: dropdown
    id: scope_area
    attributes:
      label: Scope area / 所属模块
      options:
        - Frontend / 前端
        - Backend / 后端
        - OCR
        - Analysis engine / 分析引擎
        - Simulated plan / 模拟方案
        - Result provider / 赛果同步
        - Review workflow / 复盘流程
        - LLM integration / 大模型集成
        - Documentation / 文档
        - Other / 其他
    validations:
      required: true
  - type: textarea
    id: additional_context
    attributes:
      label: Additional context / 补充信息
      description: Add only public, authorized references / 仅添加可公开且已获授权的参考信息
  - type: checkboxes
    id: scope_confirmation
    attributes:
      label: Required scope confirmation / 必须确认范围
      options:
        - label: This proposal remains within analysis, research, fictional samples, simulation, or review workflows. / 本建议仍属于分析、研究、虚构样例、模拟或复盘流程。
          required: true
        - label: It does not request real purchase, payment, ticketing, proxy purchase, following orders, deposit, or withdrawal. / 本建议不要求真实购买、支付、出票、代购、跟单、充值或提现。
          required: true
        - label: It does not request crawling, access-control bypass, caching, mirroring, or republication of official lottery data. / 本建议不要求抓取、绕过访问控制、缓存、镜像或重新发布官方彩票数据。
          required: true
        - label: It contains no profit, certainty, recovery-of-loss, accuracy, or winning guarantee. / 本建议不包含利润、确定性、回本、准确率或中奖保证。
          required: true
        - label: It contains no secrets, private data, or restricted material. / 本建议不包含秘密信息、私人数据或受限制素材。
          required: true
        - label: I agree to follow the Code of Conduct and Contributing guide. / 我同意遵守行为准则和贡献指南。
          required: true
```

- [ ] **Step 5: Create the Adoption Report form**

Create `.github/ISSUE_TEMPLATE/adoption-report.yml`:

```yaml
name: Adoption Report / 使用与采用反馈
description: Share real use and optionally permit a verified public evidence link / 分享真实使用情况，并可选择授权公开证据引用
title: "[Adoption]: "
body:
  - type: markdown
    attributes:
      value: |
        An Adoption Issue is feedback, not automatic proof. Maintainers verify consent, relationship, version, use case, and public references before updating the Public Evidence Ledger.
        Do not submit API keys, tokens, cookies, private data, real user screenshots, real betting records, personal financial information, or guaranteed outcomes.

        Adoption Issue 是使用反馈，不会自动成为采用证明。维护者必须核验授权、关系、版本、场景和公开参考，才能更新公开证据账本。
        请勿提交 API Key、Token、Cookie、私人数据、真实用户截图、真实投注记录、个人财务信息或结果保证。
  - type: input
    id: version
    attributes:
      label: Version used / 使用版本
      description: Provide a Release, commit SHA, or branch / 请填写 Release、提交 SHA 或分支
    validations:
      required: true
  - type: dropdown
    id: relationship
    attributes:
      label: Relationship to the project / 与项目的关系
      options:
        - Independent user / 独立用户
        - Organization user / 组织使用者
        - Integrator / 集成者
        - Contributor / 贡献者
        - Maintainer / 维护者
        - Other / 其他
    validations:
      required: true
  - type: dropdown
    id: environment
    attributes:
      label: Environment / 使用环境
      options:
        - Local use / 本地使用
        - Test environment / 测试环境
        - Learning experiment / 学习实验
        - Internal evaluation / 内部评估
        - Other / 其他
    validations:
      required: true
  - type: textarea
    id: use_case
    attributes:
      label: Use case / 使用场景
      description: Describe the real purpose without private business or user data / 描述真实使用目的，但不要包含私人业务或用户数据
    validations:
      required: true
  - type: textarea
    id: experience
    attributes:
      label: Experience and feedback / 使用体验与反馈
      description: Explain what was useful and what needs improvement / 说明哪些部分有用、哪些部分需要改进
    validations:
      required: true
  - type: textarea
    id: limitations
    attributes:
      label: Limitations encountered / 遇到的限制
      description: Describe obstacles or shortcomings / 描述遇到的阻碍或不足
  - type: input
    id: public_reference
    attributes:
      label: Optional public reference / 可选公开参考
      description: Public repository, article, demo, or integration URL you may publish / 你有权公开的仓库、文章、演示或集成链接
  - type: textarea
    id: additional_context
    attributes:
      label: Additional context / 补充信息
      description: Add only information that is safe to publish / 仅添加适合公开的信息
  - type: checkboxes
    id: privacy_confirmation
    attributes:
      label: Required privacy and evidence confirmation / 必须确认隐私与证据边界
      options:
        - label: The content contains no API key, token, cookie, private data, or real user screenshot. / 内容不包含 API Key、Token、Cookie、私人数据或真实用户截图。
          required: true
        - label: The content contains no real betting record, personal financial information, or gambling outcome. / 内容不包含真实投注记录、个人财务信息或博彩结果。
          required: true
        - label: The report makes no accuracy, profit, winning, or loss-recovery guarantee. / 本报告不声称项目能够保证准确率、利润、中奖或损失追回。
          required: true
        - label: I have permission to publish any supplied public reference. / 如果填写公开参考链接，我确认有权公开该链接。
          required: true
  - type: checkboxes
    id: evidence_consent
    attributes:
      label: Optional Public Evidence Ledger consent / 可选公开证据账本授权
      description: Leaving this unchecked does not block submission. Consent permits a link only after maintainer verification and can be withdrawn. / 不勾选也可正常提交。授权只允许维护者核验后引用，且可以撤回。
      options:
        - label: I authorize maintainers to link this public Issue from the repository's Public Evidence Ledger after verification. / 在维护者完成核验后，我同意维护者从仓库的公开采用证据账本中引用此公开 Issue。
  - type: checkboxes
    id: conduct_confirmation
    attributes:
      label: Code of Conduct / 行为准则
      options:
        - label: I agree to follow the Code of Conduct. / 我同意遵守行为准则。
          required: true
```

- [ ] **Step 6: Disable blank Issues and route security reports**

Create `.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Security report / 安全漏洞报告
    url: https://github.com/TomLeo-ai/football-lottery-analysis-lab/security/policy
    about: Report vulnerabilities privately through the Security Policy / 请按照安全策略私下报告漏洞
```

- [ ] **Step 7: Verify GREEN and commit**

Run:

```powershell
node --test scripts/community-templates-check.spec.mjs
npm.cmd run compliance:scan
git diff --check
git add -- .github/ISSUE_TEMPLATE scripts/community-templates-check.spec.mjs
git commit -m "feat: add bilingual Issue Forms"
```

Expected: four tests pass, zero fail; no test Issue is created.

### Task 3: Add the default Pull Request template

**Files:**

- Create: `.github/pull_request_template.md`
- Modify: `scripts/community-templates-check.spec.mjs`

- [ ] **Step 1: Append the failing PR template test**

Append:

```js
test('Pull Request template contains every approved review section', async () => {
  const source = await readRepositoryText('.github/pull_request_template.md');
  const headings = [
    '## Summary / 变更摘要',
    '## Related Issue / 关联 Issue',
    '## Changes / 主要改动',
    '## Verification / 验证证据',
    '## Compliance and Data Safety / 合规与数据安全',
    '## AI Assistance Disclosure / AI 辅助披露',
    '## Release Impact / 发布影响',
    '## Reviewer Notes / 审阅说明'
  ];
  for (const heading of headings) {
    assert.ok(source.includes(heading), 'missing PR heading: ' + heading);
  }
  assert.match(source, /Closes #/);
  assert.match(source, /npm\.cmd run verify:stage8/);
  assert.match(source, /maintainer-authored PR/i);
  assert.match(source, /not external contribution or adoption evidence/i);
});
```

- [ ] **Step 2: Verify RED**

Run `node --test scripts/community-templates-check.spec.mjs`.

Expected: four Issue tests pass; the PR test fails with `ENOENT`.

- [ ] **Step 3: Create the PR template**

Create `.github/pull_request_template.md`:

````markdown
## Summary / 变更摘要

<!-- Describe the problem and user-observable outcome. / 描述问题和用户可观察到的结果。 -->

## Related Issue / 关联 Issue

<!-- Use `Closes #123` or `Refs #123`. Explain why no Issue exists when applicable. / 使用关联语法；如无 Issue，请说明原因。 -->

## Changes / 主要改动

-

## Verification / 验证证据

<!-- Record complete commands, observed results, test counts, and anything not verified. / 记录完整命令、实际结果、测试数量和未验证项目。 -->

```powershell
npm.cmd run verify:stage8
```

- [ ] Full verification completed successfully. / 完整验证执行成功。
- [ ] Test counts and failures are recorded above. / 已记录测试数量和失败情况。
- [ ] Unverified behavior is explicitly listed. / 已明确列出未验证行为。

## Compliance and Data Safety / 合规与数据安全

- [ ] This change remains non-official and simulation-only. / 本次变更继续保持非官方、仅模拟边界。
- [ ] It does not add real purchase, payment, ticketing, proxy purchase, following orders, deposit, or withdrawal. / 本次变更不增加真实购买、支付、出票、代购、跟单、充值或提现能力。
- [ ] It does not crawl, bypass controls, cache, mirror, or republish official lottery data. / 本次变更不抓取、绕过控制、缓存、镜像或重新发布官方彩票数据。
- [ ] It contains no API keys, tokens, cookies, private data, real user screenshots, or restricted assets. / 本次变更不包含 API Key、Token、Cookie、私人数据、真实用户截图或受限制素材。
- [ ] Fictional examples remain labeled `DEMO DATA / FICTIONAL SAMPLE`. / 虚构示例继续保留明确标记。
- [ ] It makes no profit, certainty, recovery-of-loss, accuracy, or winning guarantee. / 本次变更不作出利润、确定性、回本、准确率或中奖保证。

## AI Assistance Disclosure / AI 辅助披露

Select one and describe the scope. / 请选择一项并说明范围。

- [ ] No AI assistance / 未使用 AI 辅助
- [ ] Codex or OpenAI assistance / 使用 Codex 或 OpenAI 辅助
- [ ] Other AI assistance / 使用其他 AI 辅助

Assistance scope / 辅助范围：

<!-- Exploration, code, tests, documentation, review, or other. AI output is advisory and does not replace human approval. / 探索、代码、测试、文档、审阅或其他。AI 输出仅供参考，不能替代人工批准。 -->

This maintainer-authored PR is not external contribution or adoption evidence. / 此维护者提交的 PR 不属于外部贡献或采用证据。

## Release Impact / 发布影响

- [ ] No Release / 不发布版本
- [ ] Patch Release / 补丁版本
- [ ] Minor Release / 次版本

Compatibility, upgrade notes, and known limitations / 兼容性、升级说明和已知限制：

## Reviewer Notes / 审阅说明

- [ ] Human review covered the focused diff and verification evidence. / 人工审阅已覆盖聚焦差异和验证证据。
- [ ] Human review covered compliance, privacy, and data boundaries. / 人工审阅已覆盖合规、隐私和数据边界。
- [ ] AI-generated review did not replace maintainer approval. / AI 生成的审阅未替代维护者批准。
````

- [ ] **Step 4: Verify GREEN and commit**

```powershell
node --test scripts/community-templates-check.spec.mjs
npm.cmd run compliance:scan
git diff --check
git add -- .github/pull_request_template.md scripts/community-templates-check.spec.mjs
git commit -m "feat: add bilingual Pull Request template"
```

Expected: five tests pass, zero fail.

### Task 4: Add reusable policy validation and negative fixtures

**Files:**

- Create: `scripts/community-templates-check.mjs`
- Modify: `scripts/community-templates-check.spec.mjs`

- [ ] **Step 1: Extend test imports**

Replace the filesystem import and add imports:

```js
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import {
  COMMUNITY_TEMPLATE_FILES,
  validateCommunityTemplates
} from './community-templates-check.mjs';
```

- [ ] **Step 2: Append temporary-fixture helpers and the required negative matrix**

Append:

```js
async function withTemporaryRepository(mutator, assertion) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'community-templates-'));
  try {
    for (const relativePath of COMMUNITY_TEMPLATE_FILES) {
      const destination = path.join(root, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(repositoryRoot, relativePath), destination);
    }
    await mutator(root);
    await assertion(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function mutateYaml(root, relativePath, mutation) {
  const absolutePath = path.join(root, relativePath);
  const value = YAML.parse(await readFile(absolutePath, 'utf8'));
  mutation(value);
  await writeFile(absolutePath, YAML.stringify(value), 'utf8');
}

function joinedErrors(result) {
  return result.errors.map((error) => error.file + ': ' + error.message).join('\n');
}

test('repository community templates pass reusable validation', async () => {
  const result = await validateCommunityTemplates(repositoryRoot);
  assert.deepEqual(result.errors, []);
  assert.equal(result.filesChecked, 5);
});

test('invalid YAML is rejected', async () => {
  await withTemporaryRepository(
    (root) => writeFile(path.join(root, '.github/ISSUE_TEMPLATE/bug-report.yml'), 'body: [', 'utf8'),
    async (root) => assert.match(joinedErrors(await validateCommunityTemplates(root)), /invalid YAML/i)
  );
});

test('duplicate field IDs are rejected', async () => {
  await withTemporaryRepository(
    (root) => mutateYaml(root, '.github/ISSUE_TEMPLATE/bug-report.yml', (form) => {
      form.body.push({ ...form.body.find((field) => field.id === 'version') });
    }),
    async (root) => assert.match(joinedErrors(await validateCommunityTemplates(root)), /duplicate field id "version"/i)
  );
});

test('missing required fields are rejected', async () => {
  await withTemporaryRepository(
    (root) => mutateYaml(root, '.github/ISSUE_TEMPLATE/bug-report.yml', (form) => {
      form.body = form.body.filter((field) => field.id !== 'actual');
    }),
    async (root) => assert.match(joinedErrors(await validateCommunityTemplates(root)), /missing required field "actual"/i)
  );
});

test('missing compliance acknowledgements are rejected', async () => {
  await withTemporaryRepository(
    (root) => mutateYaml(root, '.github/ISSUE_TEMPLATE/feature-request.yml', (form) => {
      form.body = form.body.filter((field) => field.id !== 'scope_confirmation');
    }),
    async (root) => assert.match(joinedErrors(await validateCommunityTemplates(root)), /scope_confirmation.*required checkbox group/i)
  );
});

test('blank Issues cannot be enabled', async () => {
  await withTemporaryRepository(
    (root) => mutateYaml(root, '.github/ISSUE_TEMPLATE/config.yml', (config) => {
      config.blank_issues_enabled = true;
    }),
    async (root) => assert.match(joinedErrors(await validateCommunityTemplates(root)), /blank_issues_enabled must be false/i)
  );
});

test('Adoption evidence consent cannot become required', async () => {
  await withTemporaryRepository(
    (root) => mutateYaml(root, '.github/ISSUE_TEMPLATE/adoption-report.yml', (form) => {
      const consent = form.body.find((field) => field.id === 'evidence_consent');
      consent.validations = { required: true };
      consent.attributes.options[0].required = true;
    }),
    async (root) => assert.match(joinedErrors(await validateCommunityTemplates(root)), /evidence_consent.*must remain optional/i)
  );
});

test('Adoption evidence consent cannot be removed', async () => {
  await withTemporaryRepository(
    (root) => mutateYaml(root, '.github/ISSUE_TEMPLATE/adoption-report.yml', (form) => {
      form.body = form.body.filter((field) => field.id !== 'evidence_consent');
    }),
    async (root) => assert.match(joinedErrors(await validateCommunityTemplates(root)), /missing optional evidence consent field/i)
  );
});

test('PR verification section cannot be removed', async () => {
  await withTemporaryRepository(
    async (root) => {
      const file = path.join(root, '.github/pull_request_template.md');
      await writeFile(file, (await readFile(file, 'utf8')).replace('## Verification / 验证证据', '## Checks'), 'utf8');
    },
    async (root) => assert.match(joinedErrors(await validateCommunityTemplates(root)), /missing PR heading.*Verification/i)
  );
});

test('PR AI disclosure section cannot be removed', async () => {
  await withTemporaryRepository(
    async (root) => {
      const file = path.join(root, '.github/pull_request_template.md');
      await writeFile(file, (await readFile(file, 'utf8')).replace('## AI Assistance Disclosure / AI 辅助披露', '## Tooling'), 'utf8');
    },
    async (root) => assert.match(joinedErrors(await validateCommunityTemplates(root)), /missing PR heading.*AI Assistance/i)
  );
});

test('fields that solicit secrets or real betting records are rejected', async () => {
  await withTemporaryRepository(
    (root) => mutateYaml(root, '.github/ISSUE_TEMPLATE/bug-report.yml', (form) => {
      form.body.push({ type: 'input', id: 'api_key', attributes: { label: 'Credential' } });
      form.body.push({ type: 'textarea', id: 'betting_record', attributes: { label: 'Record' } });
    }),
    async (root) => {
      const errors = joinedErrors(await validateCommunityTemplates(root));
      assert.match(errors, /dangerous field id "api_key"/i);
      assert.match(errors, /dangerous field id "betting_record"/i);
    }
  );
});
```

- [ ] **Step 3: Verify RED**

Run `node --test scripts/community-templates-check.spec.mjs`.

Expected: `ERR_MODULE_NOT_FOUND` for `community-templates-check.mjs`.

- [ ] **Step 4: Implement the validator**

Create `scripts/community-templates-check.mjs`:

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';

export const COMMUNITY_TEMPLATE_FILES = [
  '.github/ISSUE_TEMPLATE/bug-report.yml',
  '.github/ISSUE_TEMPLATE/feature-request.yml',
  '.github/ISSUE_TEMPLATE/adoption-report.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/pull_request_template.md'
];

const FORM_RULES = {
  '.github/ISSUE_TEMPLATE/bug-report.yml': {
    requiredFields: ['version', 'area', 'environment', 'reproduction', 'expected', 'actual'],
    optionalFields: ['frequency', 'logs', 'additional_context'],
    requiredCheckboxGroups: ['acknowledgements'],
    requiredPhrases: ['security/policy', 'API keys', 'official lottery', 'real betting']
  },
  '.github/ISSUE_TEMPLATE/feature-request.yml': {
    requiredFields: ['problem', 'use_case', 'proposed_outcome', 'acceptance_criteria', 'scope_area'],
    optionalFields: ['alternatives', 'additional_context'],
    requiredCheckboxGroups: ['scope_confirmation'],
    requiredPhrases: ['simulation', 'payment', 'crawling', 'profit']
  },
  '.github/ISSUE_TEMPLATE/adoption-report.yml': {
    requiredFields: ['version', 'relationship', 'environment', 'use_case', 'experience'],
    optionalFields: ['limitations', 'public_reference', 'additional_context'],
    requiredCheckboxGroups: ['privacy_confirmation', 'conduct_confirmation'],
    optionalConsentField: 'evidence_consent',
    requiredPhrases: ['API keys', 'real betting records', 'guaranteed outcomes']
  }
};

const ALLOWED_TYPES = new Set(['markdown', 'input', 'textarea', 'dropdown', 'checkboxes']);
const DANGEROUS_ID = /(api[_-]?key|token|password|cookie|betting[_-]?record)/i;
const SECURITY_URL = 'https://github.com/TomLeo-ai/football-lottery-analysis-lab/security/policy';
const PR_HEADINGS = [
  '## Summary / 变更摘要',
  '## Related Issue / 关联 Issue',
  '## Changes / 主要改动',
  '## Verification / 验证证据',
  '## Compliance and Data Safety / 合规与数据安全',
  '## AI Assistance Disclosure / AI 辅助披露',
  '## Release Impact / 发布影响',
  '## Reviewer Notes / 审阅说明'
];

function problem(file, message) {
  return { file, message };
}

export function validateIssueForm(form, source, file, rules = FORM_RULES[file]) {
  const errors = [];
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return [problem(file, 'form root must be a mapping')];
  }
  for (const key of ['name', 'description', 'title']) {
    if (typeof form[key] !== 'string' || form[key].trim() === '') {
      errors.push(problem(file, 'top-level "' + key + '" must be a non-empty string'));
    }
  }
  if (!Array.isArray(form.body)) {
    errors.push(problem(file, 'top-level "body" must be an array'));
    return errors;
  }

  const fields = new Map();
  for (const field of form.body) {
    if (!ALLOWED_TYPES.has(field.type)) {
      errors.push(problem(file, 'unsupported field type "' + field.type + '"'));
    }
    if (field.type === 'markdown') continue;
    if (typeof field.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(field.id)) {
      errors.push(problem(file, 'non-Markdown fields require a valid id'));
      continue;
    }
    if (fields.has(field.id)) {
      errors.push(problem(file, 'duplicate field id "' + field.id + '"'));
    }
    fields.set(field.id, field);
    if (DANGEROUS_ID.test(field.id)) {
      errors.push(problem(file, 'dangerous field id "' + field.id + '" must not solicit restricted data'));
    }
  }

  for (const id of rules.requiredFields) {
    const field = fields.get(id);
    if (!field) errors.push(problem(file, 'missing required field "' + id + '"'));
    else if (field.validations?.required !== true) errors.push(problem(file, 'field "' + id + '" must be required'));
  }
  for (const id of rules.optionalFields) {
    const field = fields.get(id);
    if (!field) errors.push(problem(file, 'missing optional field "' + id + '"'));
    else if (field.validations?.required === true) errors.push(problem(file, 'field "' + id + '" must remain optional'));
  }
  for (const id of rules.requiredCheckboxGroups) {
    const field = fields.get(id);
    const options = field?.attributes?.options;
    if (
      field?.type !== 'checkboxes' ||
      !Array.isArray(options) ||
      options.length === 0 ||
      options.some((option) => option.required !== true)
    ) {
      errors.push(problem(file, id + ' must be a required checkbox group with every option required'));
    }
  }

  if (rules.optionalConsentField) {
    const consent = fields.get(rules.optionalConsentField);
    if (!consent) {
      errors.push(problem(file, 'missing optional evidence consent field'));
    } else if (
      consent.type !== 'checkboxes' ||
      consent.validations?.required === true ||
      consent.attributes?.options?.some((option) => option.required === true)
    ) {
      errors.push(problem(file, rules.optionalConsentField + ' must remain optional'));
    }
  }

  for (const phrase of rules.requiredPhrases) {
    if (!source.toLowerCase().includes(phrase.toLowerCase())) {
      errors.push(problem(file, 'missing required safety guidance "' + phrase + '"'));
    }
  }
  return errors;
}

export function validateChooserConfig(config, file = '.github/ISSUE_TEMPLATE/config.yml') {
  const errors = [];
  if (config?.blank_issues_enabled !== false) {
    errors.push(problem(file, 'blank_issues_enabled must be false'));
  }
  if (!config?.contact_links?.some((link) => link.url === SECURITY_URL)) {
    errors.push(problem(file, 'security contact link must target ' + SECURITY_URL));
  }
  return errors;
}

export function validatePullRequestTemplate(source, file = '.github/pull_request_template.md') {
  const errors = [];
  for (const heading of PR_HEADINGS) {
    if (!source.includes(heading)) errors.push(problem(file, 'missing PR heading "' + heading + '"'));
  }
  for (const phrase of [
    'Closes #',
    'npm.cmd run verify:stage8',
    'maintainer-authored PR',
    'not external contribution or adoption evidence'
  ]) {
    if (!source.toLowerCase().includes(phrase.toLowerCase())) {
      errors.push(problem(file, 'missing required PR guidance "' + phrase + '"'));
    }
  }
  return errors;
}

async function readRequired(root, relativePath, errors) {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    errors.push(problem(relativePath, 'cannot read required file: ' + (error.code ?? error.message)));
    return null;
  }
}

function parseYaml(source, relativePath, errors) {
  try {
    return YAML.parse(source);
  } catch (error) {
    errors.push(problem(relativePath, 'invalid YAML: ' + error.message));
    return null;
  }
}

export async function validateCommunityTemplates(root) {
  const errors = [];
  let filesChecked = 0;
  for (const relativePath of Object.keys(FORM_RULES)) {
    const source = await readRequired(root, relativePath, errors);
    if (source === null) continue;
    filesChecked += 1;
    const form = parseYaml(source, relativePath, errors);
    if (form !== null) errors.push(...validateIssueForm(form, source, relativePath));
  }

  const configPath = '.github/ISSUE_TEMPLATE/config.yml';
  const configSource = await readRequired(root, configPath, errors);
  if (configSource !== null) {
    filesChecked += 1;
    const config = parseYaml(configSource, configPath, errors);
    if (config !== null) errors.push(...validateChooserConfig(config, configPath));
  }

  const pullRequestPath = '.github/pull_request_template.md';
  const pullRequestSource = await readRequired(root, pullRequestPath, errors);
  if (pullRequestSource !== null) {
    filesChecked += 1;
    errors.push(...validatePullRequestTemplate(pullRequestSource, pullRequestPath));
  }
  return { errors, filesChecked };
}

export function formatValidationErrors(errors) {
  const grouped = new Map();
  for (const error of errors) {
    grouped.set(error.file, [...(grouped.get(error.file) ?? []), error.message]);
  }
  return [...grouped.entries()]
    .map(([file, messages]) => file + ':\n' + messages.map((message) => '  ' + message).join('\n'))
    .join('\n\n');
}

export async function runCli(root = fileURLToPath(new URL('..', import.meta.url))) {
  const result = await validateCommunityTemplates(root);
  if (result.errors.length > 0) {
    console.error(formatValidationErrors(result.errors));
    return 1;
  }
  console.log(
    'Community template validation passed. Checked ' + result.filesChecked +
      ' files; blank Issues disabled, security routing present, Adoption evidence consent optional.'
  );
  return 0;
}

const executedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === executedPath) {
  process.exitCode = await runCli();
}
```

- [ ] **Step 5: Verify GREEN and commit**

```powershell
node --test scripts/community-templates-check.spec.mjs
node scripts/community-templates-check.mjs
npm.cmd run compliance:scan
git diff --check
git add -- scripts/community-templates-check.mjs scripts/community-templates-check.spec.mjs
git commit -m "test: validate community template policies"
```

Expected: `16` tests pass, zero fail; the CLI checks five files and confirms all three public-policy gates.

### Task 5: Integrate the validator into npm and CI

**Files:**

- Modify: `package.json`
- Modify: `scripts/stage8-config.spec.mjs`
- Modify: `.github/workflows/compliance.yml`

- [ ] **Step 1: Add failing Stage 8 configuration assertions**

Add after the existing `verify:stage8` assertion:

```js
assert.equal(
  packageJson.scripts['check:community-templates'],
  'node scripts/community-templates-check.mjs'
);
assert.equal(
  packageJson.scripts['test:community-templates'],
  'node --test scripts/community-templates-check.spec.mjs'
);
assert.equal(
  packageJson.scripts['verify:community-templates'],
  'npm run check:community-templates && npm run test:community-templates'
);
assert.ok(
  packageJson.scripts['verify:stage8'].startsWith('npm run verify:community-templates &&'),
  'verify:stage8 must run community template validation first'
);
assert.ok(
  workflow.includes('Run Stage 8 verification (includes community templates)'),
  'CI step name must disclose community template validation'
);
```

- [ ] **Step 2: Verify RED**

Run `npm.cmd run test:stage8-config`.

Expected: FAIL because the scripts and CI step name are absent.

- [ ] **Step 3: Add exact scripts**

Add to `package.json`:

```json
"check:community-templates": "node scripts/community-templates-check.mjs",
"test:community-templates": "node --test scripts/community-templates-check.spec.mjs",
"verify:community-templates": "npm run check:community-templates && npm run test:community-templates"
```

Replace `verify:stage8` with:

```json
"verify:stage8": "npm run verify:community-templates && npm run compliance:scan && npm run lint:web && npm run test:web && npm run build:web && npm run verify:server && npm run test:stage8-config && npm run smoke:stage8"
```

- [ ] **Step 4: Clarify the existing CI step without duplicating commands**

Replace the workflow step with:

```yaml
      - name: Run Stage 8 verification (includes community templates)
        run: npm run verify:stage8
```

- [ ] **Step 5: Verify GREEN and commit**

```powershell
npm.cmd run verify:community-templates
npm.cmd run test:stage8-config
git diff --check
git add -- package.json scripts/stage8-config.spec.mjs .github/workflows/compliance.yml
git commit -m "ci: enforce community template validation"
```

Expected: the validator and `16` tests pass; Stage 8 configuration checks exit `0`.

### Task 6: Run the full acceptance gate and stop before external writes

**Files:**

- Verify: all public changes since `origin/main`
- Update locally only: ignored `handoff.md`

- [ ] **Step 1: Run the fresh complete gate**

```powershell
npm.cmd run verify:stage8
```

Expected:

- five community files checked;
- `16` community-template tests pass;
- compliance scan passes;
- frontend type checks, tests, and production build pass;
- backend Maven Verify reports zero failures;
- Stage 8 config and API/Playwright smoke pass;
- exit code `0`.

Record actual frontend and backend counts; do not copy historical counts.

- [ ] **Step 2: Check repository integrity**

```powershell
git diff --check origin/main...HEAD
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git check-ignore -v handoff.md
```

Expected: no whitespace errors, generated files, secrets, or tracked `handoff.md`.

- [ ] **Step 3: Review public-claim boundaries**

```powershell
rg -n "external adoption|external contribution|Release|evidence_consent|blank_issues_enabled" .github scripts docs/superpowers package.json
```

Expected: Adoption consent is optional, blank Issues are disabled, maintainer/Codex activity is not external evidence, and this change requires no Release.

- [ ] **Step 4: Stop for explicit push approval**

Report the fresh evidence and proposed Draft PR. Do not push or create a PR merely because this implementation plan was approved.

- [ ] **Step 5: After explicit approval, push and verify the remote SHA**

```powershell
git push -u origin codex/community-templates
```

Expected: remote SHA equals local `HEAD`. If Git reports a transient SSL trust error, do not weaken SSL; verify through the GitHub API or authenticated browser.

- [ ] **Step 6: Create a Draft PR**

Title:

```text
feat: add validated community contribution templates
```

Body:

```markdown
## Summary

- add bilingual Bug, Feature, and Adoption Issue Forms
- disable blank Issues and route security reports to the Security Policy
- add a bilingual PR template with verification, compliance, AI disclosure, and release-impact gates
- add repository-owned YAML and policy validation with negative tests

## Verification

- `npm.cmd run verify:stage8`
- community template validator: 5 files checked
- community template tests: 16 passed, 0 failed
- frontend and backend test/build verification passed within the same fresh Stage 8 run
- `git diff --check origin/main...HEAD`

## Codex disclosure

Codex assisted with repository review, design, template drafting, validator implementation, tests, and verification. The human maintainer controls review, merge, public claims, and release decisions.

This is a maintainer-authored PR. It is not external contribution, external adoption, or independent user activity.

## Release impact

No Release. This is a community-maintenance and validation change, not a user-facing product capability release.
```

Add the observed frontend and backend counts to the Verification section before submission. Keep the PR in Draft.

- [ ] **Step 7: Verify the Draft PR**

Confirm:

- `state=open` and `draft=true`;
- base `main` and head `codex/community-templates`;
- PR head SHA equals local `HEAD`;
- GitHub Actions concludes `success` for that SHA;
- the changed-file list matches the local review;
- no Issue or Release was created.

Stop for maintainer PR review. The Issue chooser and rendered form UI remain post-merge gates because GitHub reads templates from the default branch.
