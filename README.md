# Football Lottery Analysis Lab

足彩分析与复盘实验室

Football Lottery Analysis Lab is an open-source lab for football match data analysis, simulated plan generation, and post-match review. It is non-official and only supports technical research, fictional samples, local OCR review, simulation, and review workflows.

> Compliance notice: this project is non-official, simulation-only, and does not constitute lottery advice, profit promise, or winning guarantee.

## Project Boundary

This repository is designed around strict compliance boundaries:

- No real lottery purchase, payment, ticket issuing, proxy purchase, group purchase, following orders, deposit, or withdrawal capability.
- No crawling, caching, mirroring, or republishing official lottery page data.
- Official lottery information may only appear as external link entries with clear purpose and non-official notices.
- Pre-match data must come from user-uploaded screenshots, local OCR, and manual user confirmation.
- OCR output that has not been confirmed by the user must not enter analysis or simulated plan generation.
- All examples must be fictional and marked as `DEMO DATA / FICTIONAL SAMPLE`.
- Public result providers must use compliant sports result sources, user-authorized APIs, or mock data. They must not default to official lottery pages.
- LLM providers are optional. API keys are read only by the backend from environment variables, are never returned to the frontend, and are never stored in audit records.
- LLM prediction and review insight outputs must be JSON, pass safety validation, and keep rule-engine settlement as the final authority.
- This project is not intended for minors. Do not use its simulated outputs to place wagers or make financial decisions, and comply with the laws that apply in your jurisdiction.

## First Release Scope

The first runnable release will provide a closed simulation loop:

1. Open an official external-link hub without showing official match, odds, result, or lottery data.
2. Upload a fictional screenshot sample and run local OCR or mock OCR.
3. Confirm extracted matches, markets, odds, budget, and risk preference.
4. Generate a rule-based mock analysis report.
5. Generate and save a simulated plan with immutable generation snapshot.
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

Stage 8 remains the baseline runnable release slice, and the current LLM dual-engine extension adds OpenAI-compatible prediction/review insight on top of that baseline while preserving the default rule engine:

- Web pages: `/dashboard`, `/official-source-hub`, `/screenshot-upload`, `/ocr-review`, `/match-workspace`, `/strategy-simulator`, `/saved-plans`, `/review-center`, `/strategy-lab`, `/model-settings`, `/about-compliance`
- PC layout uses a left navigation rail and top status bar; mobile layout keeps five bottom navigation entries.
- `verify:stage8` runs compliance scan, type checks, frontend tests, frontend build, Maven verify, Stage 8 config checks, API smoke flow, and Playwright responsive checks at 375px, 768px, 1024px, and 1440px.
- The closed loop covers fictional screenshot OCR, manual confirmation, Mock analysis, simulated plan save, Mock public result sync, result matching, settlement, review record, failure reason, and strategy revision rule.
- Analysis can use `MOCK_RULE_ENGINE` or `OPENAI_COMPATIBLE`; omitted `engineMode` still defaults to `MOCK_RULE_ENGINE`.
- Review can use `RULE_REVIEW_ONLY` or `RULE_REVIEW_WITH_LLM_INSIGHT`; settlement status is always produced by the rule engine.

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
POST http://127.0.0.1:8080/api/screenshots/tasks
POST http://127.0.0.1:8080/api/ocr/parse-local-result
POST http://127.0.0.1:8080/api/ocr/review/confirm
GET  http://127.0.0.1:8080/api/model-providers
POST http://127.0.0.1:8080/api/model-providers/test
GET  http://127.0.0.1:8080/api/engine-settings
PUT  http://127.0.0.1:8080/api/engine-settings
GET  http://127.0.0.1:8080/api/strategy-parameter-defaults
PUT  http://127.0.0.1:8080/api/strategy-parameter-defaults
POST http://127.0.0.1:8080/api/analysis/generate
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

This repository is under staged implementation. Stage 8 is runnable and covers the official external-link hub, fictional screenshot OCR confirmation, rule-engine analysis, optional OpenAI-compatible LLM prediction, simulated plan generation/save, Mock public result provider sync/status, automatic review, optional LLM review insight, responsive navigation, H2/Flyway persistence, and Stage 8 automated smoke verification.

## License

Apache License 2.0. See [LICENSE](LICENSE).
