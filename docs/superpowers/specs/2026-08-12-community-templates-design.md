# GitHub Community Contribution Templates Design

## Objective

Add structured, bilingual GitHub contribution entry points for real bug reports,
feature requests, adoption feedback, and pull requests. The templates must help
contributors provide actionable information without weakening the repository's
simulation-only, privacy, security, and evidence-integrity boundaries.

This change does not create sample Issues, claim external adoption, automate
evidence verification, add a Codex GitHub Action, or publish a Release.

## Confirmed Decisions

- User-facing template copy is bilingual: English first, followed by Chinese.
- Contributors fill each field once; separate English and Chinese responses are
  not required.
- Blank Issues are disabled.
- Security reports are routed to `SECURITY.md`, not to a public Bug Issue.
- Adoption evidence consent is optional. An Adoption Issue can be submitted
  without consent, but it cannot be linked from the Public Evidence Ledger.
- GitHub-native Issue Forms and a default pull request template are backed by a
  repository-owned validation script and negative tests.
- The implementation uses a new branch and pull request based on the latest
  public `main` branch.

## Files and Responsibilities

The implementation will add:

```text
.github/
├─ ISSUE_TEMPLATE/
│  ├─ bug-report.yml
│  ├─ feature-request.yml
│  ├─ adoption-report.yml
│  └─ config.yml
└─ pull_request_template.md

scripts/
├─ community-templates-check.mjs
└─ community-templates-check.spec.mjs
```

It will update:

```text
package.json
package-lock.json
.github/workflows/compliance.yml
```

`yaml` version `2.9.0` will be added as an exact direct development dependency.
The validator must not rely on Vite's optional transitive YAML peer dependency.

## Shared Issue Form Rules

Each Issue Form will contain:

- bilingual `name` and `description` text;
- an English title prefix for stable classification;
- unique, automation-friendly English field identifiers;
- Markdown guidance explaining what is safe to submit;
- only one response field for each bilingual prompt;
- a required acknowledgement of the Code of Conduct;
- privacy and compliance acknowledgements appropriate to the form;
- no assignee configuration that implies a response-time commitment.

Forms must not request or encourage submission of API keys, tokens, passwords,
cookies, browser sessions, private user data, real betting records, personal
financial information, official lottery screenshots, copied official assets,
or guaranteed-profit evidence.

## Bug Report Form

File: `.github/ISSUE_TEMPLATE/bug-report.yml`

Title prefix: `[Bug]`

| Field ID | Label | Required | Purpose |
| --- | --- | ---: | --- |
| `version` | Project version / 项目版本 | Yes | Release, commit SHA, or branch |
| `area` | Affected area / 影响模块 | Yes | Frontend, backend, OCR, analysis engine, simulated plan, result provider, review, LLM, documentation, or other |
| `environment` | Environment / 运行环境 | Yes | OS, browser, Node, Java, and relevant database configuration |
| `reproduction` | Reproduction steps / 复现步骤 | Yes | Minimal repeatable steps |
| `expected` | Expected behavior / 预期行为 | Yes | Expected observable result |
| `actual` | Actual behavior / 实际行为 | Yes | Actual observable result |
| `frequency` | Frequency / 出现频率 | No | Always, intermittent, first run only, or other |
| `logs` | Sanitized logs / 已脱敏日志 | No | Logs after removing secrets and private data |
| `additional_context` | Additional context / 补充信息 | No | Other public context |

Required submission acknowledgements:

- the reporter searched existing Issues for duplicates;
- secrets, cookies, private information, and real user data were removed;
- no official lottery screenshot, logo, copied asset, or official dataset is
  attached;
- the report contains no real purchase, payment, ticketing, betting record,
  profit promise, or winning guarantee;
- the reporter agrees to `CODE_OF_CONDUCT.md` and `CONTRIBUTING.md`.

The introductory guidance routes security vulnerabilities to `SECURITY.md`.

## Feature Request Form

File: `.github/ISSUE_TEMPLATE/feature-request.yml`

Title prefix: `[Feature]`

| Field ID | Label | Required | Purpose |
| --- | --- | ---: | --- |
| `problem` | Problem or need / 问题或需求 | Yes | Real problem or limitation |
| `use_case` | Use case / 使用场景 | Yes | Who needs the outcome and in which workflow |
| `proposed_outcome` | Proposed outcome / 期望结果 | Yes | User-observable result, without requiring an implementation design |
| `acceptance_criteria` | Acceptance criteria / 验收标准 | Yes | Runnable, observable, repeatable acceptance conditions |
| `alternatives` | Alternatives considered / 已考虑的替代方案 | No | Existing workaround or alternative |
| `scope_area` | Scope area / 所属模块 | Yes | Same module taxonomy used by Bug reports |
| `additional_context` | Additional context / 补充信息 | No | Public references or context |

Required submission acknowledgements:

- the proposal remains within analysis, research, fictional samples,
  simulation, or review workflows;
- it does not request real purchase, payment, ticket issuing, proxy purchase,
  following orders, deposit, or withdrawal capability;
- it does not request crawling, access-control bypass, caching, mirroring, or
  republication of official lottery data;
- it contains no profit, certainty, recovery-of-loss, accuracy guarantee, or
  winning guarantee;
- it contains no secret, private data, or restricted material;
- the requester agrees to the contribution guide and Code of Conduct.

## Adoption Report Form

File: `.github/ISSUE_TEMPLATE/adoption-report.yml`

Title prefix: `[Adoption]`

Submitting this form does not automatically create a verified adopter entry.

| Field ID | Label | Required | Purpose |
| --- | --- | ---: | --- |
| `version` | Version used / 使用版本 | Yes | Release, commit SHA, or branch |
| `relationship` | Relationship to the project / 与项目的关系 | Yes | Independent user, organization user, integrator, contributor, maintainer, or other |
| `environment` | Environment / 使用环境 | Yes | Local use, test environment, learning experiment, internal evaluation, or other |
| `use_case` | Use case / 使用场景 | Yes | Real usage purpose without private business data |
| `experience` | Experience and feedback / 使用体验与反馈 | Yes | Useful areas and improvement needs |
| `limitations` | Limitations encountered / 遇到的限制 | No | Obstacles or shortcomings |
| `public_reference` | Optional public reference / 可选公开参考 | No | Public repository, article, demo, or integration link |
| `additional_context` | Additional context / 补充信息 | No | Other public information |

Required submission acknowledgements:

- the content contains no API key, token, cookie, private data, or real user
  screenshot;
- the content contains no real betting record, personal financial information,
  or gambling outcome;
- the report makes no accuracy, profit, winning, or loss-recovery guarantee;
- the reporter has permission to publish any supplied public reference;
- the reporter agrees to the Code of Conduct.

The form includes a separate optional checkbox with field ID
`evidence_consent`:

> I authorize maintainers to link this public Issue from the repository's
> Public Evidence Ledger after verification.
>
> 在维护者完成核验后，我同意维护者从仓库的公开采用证据账本中引用此公开 Issue。

Consent rules:

- the Issue remains submittable when the checkbox is not selected;
- selection permits a link but does not prove adoption;
- maintainers still verify the relationship, version, use case, and any public
  reference before updating the ledger;
- a maintainer relationship is recorded as maintainer evidence, never external
  adoption;
- consent withdrawal requires removal of the ledger link;
- Stars, Forks, anonymous analytics, and unverified claims are not substitutes
  for verified adoption.

## Issue Chooser Configuration

File: `.github/ISSUE_TEMPLATE/config.yml`

The configuration sets `blank_issues_enabled: false` and includes a contact link
named `Security report / 安全漏洞报告` that points to the repository's public
Security Policy at
`https://github.com/TomLeo-ai/football-lottery-analysis-lab/security/policy`,
which renders the root `SECURITY.md`. No security report should be solicited in
a public Issue.

## Pull Request Template

File: `.github/pull_request_template.md`

The default template contains these bilingual sections:

```text
Summary / 变更摘要
Related Issue / 关联 Issue
Changes / 主要改动
Verification / 验证证据
Compliance and Data Safety / 合规与数据安全
AI Assistance Disclosure / AI 辅助披露
Release Impact / 发布影响
Reviewer Notes / 审阅说明
```

The author must:

- describe the problem and user-observable outcome;
- link the related Issue with `Closes #...` or `Refs #...`, or explain why no
  Issue exists;
- list the focused file or behavior scope;
- record complete verification commands, observed results, and anything not
  verified;
- confirm the repository's simulation, data, privacy, and restricted-material
  boundaries;
- disclose whether Codex/OpenAI, another AI tool, or no AI tool assisted with
  exploration, code, tests, documentation, or review;
- select no release, patch release, or minor release and document compatibility,
  upgrade notes, and known limitations when relevant.

AI disclosure provides maintenance transparency. It does not attribute the PR
to an external contributor or independent reviewer, and AI review cannot replace
human approval.

## Validator Design

File: `scripts/community-templates-check.mjs`

The module exports testable validation functions and also runs as a CLI. It uses
`yaml` to parse the four YAML files and performs repository-specific policy
checks after parsing.

The validator checks:

1. all five public template files exist;
2. each Issue Form has `name`, `description`, `title`, and `body`;
3. form element types are supported by GitHub: `markdown`, `input`, `textarea`,
   `dropdown`, or `checkboxes`;
4. non-Markdown field IDs contain only letters, numbers, `-`, and `_`, and are
   unique within a form;
5. the specified fields exist and have the approved required/optional state;
6. required compliance and privacy acknowledgements exist;
7. `evidence_consent` exists and is not required;
8. `blank_issues_enabled` is exactly `false` and the security contact link is
   present;
9. all approved pull request template sections are present;
10. field IDs do not request dangerous content such as `api_key`, `token`,
    `password`, `cookie`, or `betting_record`;
11. each form includes the approved redaction and prohibited-content guidance.

The validator does not access the network, create an Issue or Pull Request, read
secret environment variables, judge adoption authenticity, or update the Public
Evidence Ledger.

### CLI Output

Validation failures are grouped by source file and use actionable messages:

```text
.github/ISSUE_TEMPLATE/adoption-report.yml:
  field "evidence_consent" must remain optional

.github/ISSUE_TEMPLATE/config.yml:
  blank_issues_enabled must be false
```

The CLI reports all detected errors in one run when practical and exits nonzero
on failure. Successful output includes the checked file count and confirms the
blank-Issue, security-routing, and optional-consent policies. The validator never
rewrites a template automatically.

## Validator Tests

File: `scripts/community-templates-check.spec.mjs`

Tests use `node:test` and `node:assert/strict`; no additional test framework is
introduced. Temporary malformed fixtures are created under an operating-system
temporary directory and removed after the test.

Required cases:

1. the current repository templates pass;
2. invalid YAML fails;
3. duplicate field IDs fail;
4. a missing required field fails;
5. a missing privacy or compliance acknowledgement fails;
6. `blank_issues_enabled: true` fails;
7. required adoption consent fails;
8. missing adoption consent fails;
9. a missing PR verification section fails;
10. a missing AI disclosure section fails;
11. a dangerous secret, cookie, or betting-record field ID fails.

## npm and CI Integration

`package.json` adds:

```json
{
  "scripts": {
    "check:community-templates": "node scripts/community-templates-check.mjs",
    "test:community-templates": "node --test scripts/community-templates-check.spec.mjs",
    "verify:community-templates": "npm run check:community-templates && npm run test:community-templates"
  }
}
```

`verify:stage8` runs `verify:community-templates` before the existing compliance,
frontend, backend, build, configuration, and smoke checks. The GitHub Actions
workflow continues to call `npm run verify:stage8`, keeping local and CI gates
aligned. The workflow file may receive a comment or step-name clarification, but
it must not duplicate the template command outside the unified Stage 8 command.

## Error Handling and Safety

- YAML parse errors identify the file and parser message without printing secret
  environment values.
- Missing files, wrong types, and policy violations are independent errors.
- Tests clean temporary fixtures even after assertions fail.
- Validation performs read-only repository checks and never edits templates.
- The implementation and PR must contain no sample Issue, adoption claim,
  private user data, credential, or real official lottery material.

## Verification and Acceptance

### Local Structural Gate

Run:

```shell
npm run check:community-templates
npm run test:community-templates
npm run verify:stage8
git diff --check
```

Acceptance requires zero test failures, a successful full Stage 8 verification,
no untracked runtime files, and no secret or private-data additions.

### Pull Request Gate

- create `codex/community-templates` from the latest `origin/main`;
- keep the change focused on templates, validation, tests, and integration;
- push and open a Draft PR only after local verification;
- disclose Codex assistance with design, validation, tests, and documentation;
- state that this maintainer-authored PR is not external contribution or
  adoption evidence;
- require a green GitHub Actions result and human review before merge;
- do not publish a Release for this maintenance-only change.

### Post-Merge GitHub Gate

After the templates reach the default branch:

1. verify that the New Issue chooser shows Bug, Feature, and Adoption entries;
2. verify that no blank Issue entry is available;
3. verify that the security link resolves to `SECURITY.md`;
4. open each form without submitting and confirm bilingual copy, required fields,
   and optional Adoption consent;
5. do not create a test Issue;
6. verify automatic PR-template population on the next real Pull Request rather
   than manufacturing an empty PR.

## Out of Scope

- GitHub Discussions configuration;
- automated adoption approval or ledger updates;
- `openai/codex-action` or any untrusted-text automation;
- repository rulesets, branch protection, or CODEOWNERS changes;
- labels, milestones, bots, or response-time promises;
- a new product Release;
- fabricated Issues, Pull Requests, adopters, Stars, Forks, or testimonials.
