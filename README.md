# Football Lottery Analysis Lab

足彩分析与复盘实验室

Football Lottery Analysis Lab is an open-source lab for football match data analysis, simulated plan generation, and post-match review. It is non-official and only supports technical research, fictional samples, local OCR review, simulation, and review workflows.

> Compliance notice: this project is non-official, simulation-only, and does not constitute lottery advice, profit promise, or winning guarantee.

The repository currently contains the `v0.2.0` release candidate implementation.
This wording describes preparation and verification evidence only: no `v0.2.0`
tag or GitHub Release is claimed here, and it is not evidence of external
adoption.

## Public Trial

The project is prepared for a disposable Render Free public trial. The public
URL will be added here after the maintainer authorizes and completes the first
Render deployment.

> Trial data warning: the first visit can take about one minute while the free
> service wakes. Service sleep, restart, redeploy, or upgrade can clear drafts,
> simulated plans, and review data. Do not rely on the trial to preserve
> important information, and do not upload sensitive images or images you do
> not have permission to use.

The trial is for exploration and feedback, not production use or durable
storage. Original images and complete OCR text keep the existing browser-local
boundary. No external LLM credential, persistent disk, or production database
is configured by default.

- [Report a trial problem or propose an improvement](https://github.com/TomLeo-ai/football-lottery-analysis-lab/issues)
- [Deploy this repository to Render](https://render.com/deploy?repo=https://github.com/TomLeo-ai/football-lottery-analysis-lab)
- [Read the public-trial deployment design](docs/superpowers/specs/2026-08-30-public-trial-deployment-design.md)

A working deployment is accessibility evidence only. It does not establish
external adoption or guarantee acceptance into Codex for Open Source.

## Project Boundary

This repository is designed around strict compliance boundaries:

- No real lottery purchase, payment, ticket issuing, proxy purchase, group purchase, following orders, deposit, or withdrawal capability.
- No crawling, caching, mirroring, or republishing official lottery page data.
- Official lottery information may only appear as external link entries with clear purpose and non-official notices.
- Pre-match data must come from user-uploaded screenshots, local OCR, and manual user confirmation.
- Screenshot pixels and complete OCR text remain inside the browser. Only the
  minimum structured review candidate may cross the same-origin API boundary.
- The release-candidate OCR workflow accepts WDL markets only; unsupported
  market types are rejected rather than silently converted.
- OCR output that has not been confirmed by the user must not enter analysis or simulated plan generation.
- All examples must be fictional and marked as `DEMO DATA / FICTIONAL SAMPLE`.
- Public result providers must use compliant sports result sources, user-authorized APIs, or mock data. They must not default to official lottery pages.
- LLM providers are optional. API keys are read only by the backend from environment variables, are never returned to the frontend, and are never stored in audit records.
- LLM prediction and review insight outputs must be JSON, pass safety validation, and keep rule-engine settlement as the final authority.
- This project is not intended for minors. Do not use its simulated outputs to place wagers or make financial decisions, and comply with the laws that apply in your jurisdiction.

## v0.2.0 Release Candidate Scope

The current candidate provides this closed, restart-recoverable simulation loop:

1. Open an official external-link hub without showing official match, odds, result, or lottery data.
2. Upload the rights-safe fictional sample and run real browser-local Tesseract
   OCR, including local crop, rotation, and redaction controls.
3. Edit and persist a revisioned structured draft, reload it after a backend
   process restart, and explicitly confirm the selected revision.
4. Create a server-authoritative confirmed snapshot and generate a rule-based
   analysis report from that authority lineage.
5. Generate and save a simulated plan, then reopen it through its direct link.
6. Sync mock public results.
7. Match results, settle the saved plan, and generate review records with failure reasons and strategy revision rules.

## Repository Layout

```text
football-lottery-analysis-lab/
  apps/
    web/                 # Vue3 + Vite + TypeScript frontend
    server/              # Spring Boot 3 backend API
  packages/
    shared-contracts/    # Shared API and data contracts
    ocr-core/            # Browser local OCR helpers and interfaces
  sample-data/           # Fictional samples only
  examples/
    screenshot-samples/  # Fictional screenshot sample notes
    json-provider/       # Mock public result provider samples
  docs/                  # Compliance, product, and workflow docs
  scripts/               # Automation and compliance scans
  .github/workflows/     # CI workflows
```

## Current Stage

Stage 9 is the current `v0.2.0` release-candidate gate. Stage 8 remains a
historical baseline and its command is retained for reproducibility.

- Web pages: `/dashboard`, `/official-source-hub`, `/screenshot-upload`, `/ocr-review`, `/match-workspace`, `/strategy-simulator`, `/saved-plans`, `/review-center`, `/strategy-lab`, `/model-settings`, `/about-compliance`
- PC layout uses a left navigation rail and top status bar; mobile layout keeps five bottom navigation entries.
- `verify:stage9` is the current CI gate. It includes repository compliance,
  package/server checks, the historical Stage 8 checks, and the private Stage 9
  browser golden flow.
- The Stage 9 golden flow exercises packaged Tesseract assets over same-origin
  browser requests, persisted draft reload across a backend restart, explicit
  confirmation, authority-bound Mock rule analysis, plan save, and plan deep
  link recovery. It also audits browser storage, runtime traffic, logs, build
  output, temporary files, and the isolated H2 database for the original image
  and complete OCR text boundary.
- Packaged OCR runtime and language assets keep their upstream license notices;
  see [NOTICE](NOTICE) and the linked third-party license files.
- Revision writes use compare-and-swap semantics, and mutating workflow,
  analysis, and plan requests use UUID idempotency keys. Reusing a key with a
  different payload is rejected.
- Analysis can use `MOCK_RULE_ENGINE` or `OPENAI_COMPATIBLE`; omitted `engineMode` still defaults to `MOCK_RULE_ENGINE`.
- Review can use `RULE_REVIEW_ONLY` or `RULE_REVIEW_WITH_LLM_INSIGHT`; settlement status is always produced by the rule engine.

### v0.2.0 compatibility note

The revisioned OCR workflow is an intentional internal API breaking change.
Clients must use `/api/ocr/workflows`, `/api/ocr/review-drafts`, and an
`Idempotency-Key`; the former `POST /api/ocr/review/confirm` endpoint remains a
`410 Gone` tombstone so stale clients fail explicitly. Existing Stage 8 database
rows remain readable through nullable authority columns (`legacy null`
compatibility), but new writes must carry the Stage 9 authority lineage.

## Open-Source Maintenance

The repository is maintained through small, independently verifiable changes.
Releases are published for meaningful fixes or capabilities rather than to create
artificial activity. Codex may assist with implementation, tests, documentation,
Issue/PR review, and release preparation, while a human maintainer remains
responsible for every commit, merge, tag, release, and public claim.

- [Maintenance, release, Codex, and adoption-evidence policy](docs/oss-maintenance.md)
- [Contribution guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Release history](https://github.com/TomLeo-ai/football-lottery-analysis-lab/releases)
- [Issues and user feedback](https://github.com/TomLeo-ai/football-lottery-analysis-lab/issues)

The project records only publicly verifiable, consented adoption evidence and
does not manufacture Stars, Forks, Issues, Pull Requests, contributors, or usage
claims.

## LLM Dual Engine

The optional LLM layer uses OpenAI-compatible Chat Completions over the backend HTTP client. It does not require a heavyweight model SDK and is disabled unless the selected provider has a backend environment variable configured.

Supported provider templates:

```text
openai
azure-openai
deepseek
dashscope-qwen
zhipu-glm
volcengine-ark
moonshot-kimi
gemini-openai
openrouter
litellm-proxy
local-openai-compatible
```

Runtime prompt packs live in the repository:

```text
apps/server/src/main/resources/prompts/danche-prediction-v1.md
apps/server/src/main/resources/prompts/danche-review-insight-v1.md
apps/server/src/main/resources/prompts/danche-safety-guard-v1.md
```

Model setup is available at:

```text
http://127.0.0.1:5173/model-settings
```

Provider credentials are configured through backend environment variables only. A local reference file is available at:

```text
apps/server/.env.example
```

PowerShell examples:

```shell
$env:DEEPSEEK_API_KEY="replace-with-your-deepseek-key"
$env:OPENAI_API_KEY="replace-with-your-key"
$env:LOCAL_OPENAI_COMPATIBLE_API_KEY="replace-with-local-key"
mvn -f apps/server/pom.xml spring-boot:run
```

DeepSeek verification for this stage uses:

```text
providerKey=deepseek
baseUrl=https://api.deepseek.com
modelId=deepseek-v4-pro
apiKeyEnvName=DEEPSEEK_API_KEY
```

Keep the real `DEEPSEEK_API_KEY` only in the backend process environment. Do
not write it into source code, docs, logs, databases, frontend responses, or
test snapshots.

Prediction requests can explicitly set:

```json
{
  "engineMode": "OPENAI_COMPATIBLE",
  "providerKey": "deepseek",
  "modelId": "deepseek-v4-pro",
  "promptVersion": "danche-prediction-v1"
}
```

Review insight requests can explicitly set:

```json
{
  "reviewEngineMode": "RULE_REVIEW_WITH_LLM_INSIGHT",
  "providerKey": "deepseek",
  "modelId": "deepseek-v4-pro",
  "promptVersion": "danche-review-insight-v1"
}
```

All LLM calls are audited in `llm_invocation_audit`. Audit rows store provider/model metadata, prompt version, input/output hashes, token usage, latency, safety status, and error code. They do not store API keys, full prompts, screenshots, or raw model output.

See [docs/llm-prompt-policy.md](docs/llm-prompt-policy.md), [docs/ai-safety.md](docs/ai-safety.md), and [docs/compliance.md](docs/compliance.md) for Prompt Pack rules, structured validation, blocked-output handling, and compliance boundaries.

## Local Verification

Install frontend dependencies:

```shell
npm install
```

Run the compliance scan:

```shell
npm run compliance:scan
```

The scan checks for high-risk promotional copy and prohibited capability signals outside approved compliance contexts.

Run the Stage 2 verification chain:

```shell
npm run verify:stage2
```

Run the Stage 3 verification chain:

```shell
npm run verify:stage3
```

Run the Stage 4 verification chain:

```shell
npm run verify:stage4
```

Run the Stage 5 verification chain:

```shell
npm run verify:stage5
```

Run the Stage 6 verification chain:

```shell
npm run verify:stage6
```

Run the Stage 7 verification chain:

```shell
npm run verify:stage7
```

Install the Playwright Chromium browser once before the Stage 8 smoke check:

```shell
npx playwright install chromium
```

Run the Stage 8 verification chain:

```shell
npm run verify:stage8
```

Run the current Stage 9 release-candidate verification chain:

```shell
npm run verify:stage9
```

`verify:stage9` is the repository's current required CI gate. Its browser smoke
uses an isolated temporary database and removes runtime evidence after the
audit; it does not publish a release or send OCR input to an external service.

Run the optional real DeepSeek integration smoke only after setting the backend
process environment variable in the same PowerShell session:

```shell
$env:DEEPSEEK_API_KEY="replace-with-your-deepseek-key"
npm run smoke:deepseek
```

`npm run smoke:deepseek` is intentionally separate from `verify:stage8` because
it performs real provider calls. It checks `/api/model-providers`,
`/api/model-providers/test`, `OPENAI_COMPATIBLE` prediction with
`deepseek-v4-pro`, simulated plan save/match, and
`RULE_REVIEW_WITH_LLM_INSIGHT` review insight without printing or persisting the
API key. If `DEEPSEEK_API_KEY` is missing, the command exits with a clear error
instead of silently passing.

## Local H2 Database

The backend uses an H2 Embedded File database by default. No MySQL, PostgreSQL,
Redis, or external database server is required for local startup.

Start the backend:

```shell
mvn -f apps/server/pom.xml spring-boot:run
```

Flyway automatically creates the local schema from:

```text
apps/server/src/main/resources/db/migration/
```

The local database files are written under:

```text
apps/server/data/
```

This runtime directory and H2 file extensions are ignored by Git. To reset local
data, stop the backend and remove `apps/server/data/`; the next startup will
recreate the schema.

H2 Console is available for local development at:

```text
http://127.0.0.1:8080/h2-console
```

Use the JDBC URL from `apps/server/src/main/resources/application.yml`:

```text
jdbc:h2:file:./data/football_lottery_analysis_lab;MODE=MySQL;DATABASE_TO_LOWER=TRUE
```

The future MySQL migration template is available at:

```text
apps/server/src/main/resources/application-mysql.example.yml
```

Migration steps are: create the MySQL database, adjust
`spring.datasource.url`, `username`, `password`, and `driver-class-name`, review
Flyway SQL compatibility, then start the backend with the MySQL profile.

See [docs/database.md](docs/database.md) for the full H2 Console, cleanup, and
MySQL migration guide.

Start the backend:

```shell
mvn -f apps/server/pom.xml spring-boot:run
```

Start the frontend in another terminal:

```shell
npm run dev:web
```

Open:

```text
http://127.0.0.1:5173/official-source-hub
http://127.0.0.1:5173/dashboard
http://127.0.0.1:5173/screenshot-upload
http://127.0.0.1:5173/ocr-review
http://127.0.0.1:5173/match-workspace
http://127.0.0.1:5173/strategy-simulator
http://127.0.0.1:5173/saved-plans
http://127.0.0.1:5173/review-center
http://127.0.0.1:5173/strategy-lab
http://127.0.0.1:5173/model-settings
http://127.0.0.1:5173/about-compliance
```

The current APIs are available at:

```text
http://127.0.0.1:8080/api/official-links
POST http://127.0.0.1:8080/api/ocr/workflows
GET  http://127.0.0.1:8080/api/ocr/workflows/{workflowId}
POST http://127.0.0.1:8080/api/ocr/workflows/{workflowId}/ocr-candidates
DELETE http://127.0.0.1:8080/api/ocr/workflows/{workflowId}
GET  http://127.0.0.1:8080/api/ocr/review-drafts/{ocrTaskId}
PUT  http://127.0.0.1:8080/api/ocr/review-drafts/{ocrTaskId}
POST http://127.0.0.1:8080/api/ocr/review-drafts/{ocrTaskId}/confirm
GET  http://127.0.0.1:8080/api/ocr/snapshots/{snapshotId}
POST http://127.0.0.1:8080/api/screenshots/tasks
POST http://127.0.0.1:8080/api/ocr/parse-local-result
POST http://127.0.0.1:8080/api/ocr/review/confirm  # legacy 410 tombstone
GET  http://127.0.0.1:8080/api/model-providers
POST http://127.0.0.1:8080/api/model-providers/test
GET  http://127.0.0.1:8080/api/engine-settings
PUT  http://127.0.0.1:8080/api/engine-settings
GET  http://127.0.0.1:8080/api/strategy-parameter-defaults
PUT  http://127.0.0.1:8080/api/strategy-parameter-defaults
POST http://127.0.0.1:8080/api/analysis/generate
GET  http://127.0.0.1:8080/api/analysis/reports/{reportId}
POST http://127.0.0.1:8080/api/strategies/simulate
POST http://127.0.0.1:8080/api/simulated-plans
GET  http://127.0.0.1:8080/api/simulated-plans
GET  http://127.0.0.1:8080/api/simulated-plans/{planId}
POST http://127.0.0.1:8080/api/result-providers/sync
GET  http://127.0.0.1:8080/api/result-providers/status
GET  http://127.0.0.1:8080/api/reviews/pending
POST http://127.0.0.1:8080/api/simulated-plans/{planId}/match-result
POST http://127.0.0.1:8080/api/simulated-plans/{planId}/settle
GET  http://127.0.0.1:8080/api/simulated-plans/{planId}/review
```

## Development Status

This repository is under staged implementation. Stage 9 is a runnable
`v0.2.0` release candidate with real browser-local OCR, restart-recoverable
drafts and workflow state, server-authoritative snapshot/report/plan lineage,
rule-engine analysis, plan deep links, H2/Flyway persistence, and a private
golden-flow CI gate. Stage 8 remains available as historical verification.
Passing these checks is release-preparation evidence, not a tag, GitHub Release,
user count, production deployment, or adoption claim.

## License

Apache License 2.0. See [LICENSE](LICENSE).
