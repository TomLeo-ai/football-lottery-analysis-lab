# Server App

Spring Boot 3 backend API for Football Lottery Analysis Lab.

## Current API

```text
GET /api/official-links
POST /api/screenshots/tasks
POST /api/ocr/parse-local-result
POST /api/ocr/review/confirm
GET /api/model-providers
POST /api/model-providers/test
GET /api/engine-settings
PUT /api/engine-settings
GET /api/strategy-parameter-defaults
PUT /api/strategy-parameter-defaults
POST /api/analysis/generate
POST /api/strategies/simulate
POST /api/simulated-plans
GET /api/simulated-plans
GET /api/simulated-plans/{planId}
POST /api/result-providers/sync
GET /api/result-providers/status
GET /api/reviews/pending
POST /api/simulated-plans/{planId}/match-result
POST /api/simulated-plans/{planId}/settle
GET /api/simulated-plans/{planId}/review
```

`GET /api/official-links` returns official external-link metadata only:

- name
- url
- purpose
- region
- target
- rel
- nonOfficialNotice
- dataPolicy
- updatedAt

It does not crawl, cache, mirror, or display official page content.

## Local Database

The backend uses H2 Embedded File mode by default and writes local database
files to `apps/server/data/` when started with:

```shell
mvn -f apps/server/pom.xml spring-boot:run
```

Flyway runs migrations from:

```text
apps/server/src/main/resources/db/migration/
```

The default JDBC URL is:

```text
jdbc:h2:file:./data/football_lottery_analysis_lab;MODE=MySQL;DATABASE_TO_LOWER=TRUE
```

H2 Console is enabled for local development at:

```text
http://127.0.0.1:8080/h2-console
```

Use username `sa` with an empty password. Do not expose H2 Console outside local
development.

Runtime database files under `apps/server/data/` and H2 file extensions are
ignored by Git. To reset local data, stop the backend and remove
`apps/server/data/`.

The MySQL migration template is:

```text
apps/server/src/main/resources/application-mysql.example.yml
```

Future MySQL migration steps are: create the database, adjust datasource URL,
username, password, and driver class, review Flyway SQL compatibility, and then
start the backend with the MySQL profile.

## Persisted Workflow Data

OCR APIs persist the local workflow:

- `POST /api/screenshots/tasks` creates a `screenshot_task` row with
  `WAITING_LOCAL_OCR` and `serverOcrEnabled=false`.
- `POST /api/ocr/parse-local-result` stores an `ocr_task` row and returns
  `WAITING_USER_CONFIRMATION` with `analysisAllowed=false`.
- `POST /api/ocr/review/confirm` stores an `ocr_confirmed_snapshot` row with
  `sourceType=USER_SCREENSHOT_CONFIRMED`.

`POST /api/analysis/generate` accepts only confirmed snapshots with
`analysisAllowed=true`. If `engineMode` is omitted, it defaults to
`MOCK_RULE_ENGINE` and stores an `analysis_report` snapshot. If
`engineMode=OPENAI_COMPATIBLE`, the backend resolves the selected provider from
environment variables, calls the OpenAI-compatible Chat Completions endpoint,
validates JSON output, stores model metadata, and stores `llm_audit_id`.

Simulated plan APIs persist saved plans:

- `POST /api/strategies/simulate` accepts a generated analysis report and
  returns a `GENERATED` simulated plan.
- `POST /api/simulated-plans` stores the plan in `simulated_plan` and
  `simulated_plan_item`, moving it through `GENERATED -> SAVED -> PENDING_RESULT`.
- `GET /api/simulated-plans` reads saved simulated plans from the database.
- `GET /api/simulated-plans/{planId}` reads saved simulated plan detail from the
  database.

Public result provider APIs persist Mock snapshots:

- `POST /api/result-providers/sync` creates fictional Mock public result
  snapshots in `public_result_snapshot`.
- `GET /api/result-providers/status` restores provider metadata and latest sync
  status from persisted snapshots.
- Every snapshot records `sourceName`, `sourceUrl`, `sourceLicense`,
  `fetchedAt`, and `confidence`.

Review APIs persist review records:

- `GET /api/reviews/pending` returns saved `PENDING_RESULT` simulated plans that
  do not have a `review_record` yet.
- `POST /api/simulated-plans/{planId}/match-result` matches saved plan items
  against Mock public result snapshots by match id and available match metadata.
- `POST /api/simulated-plans/{planId}/settle` stores a `review_record` with
  settlement status, failure reasons, strategy revision rules, result source
  metadata, historical `strategy_parameters_json`, optional LLM insight JSON,
  safety status, and `llm_audit_id`.
- `GET /api/simulated-plans/{planId}/review` reads the persisted review record.

## Model Provider Setup

`GET /api/model-providers` returns provider metadata, default model, API key
environment variable name, credential status, and connection status. It never
returns API key values.

`POST /api/model-providers/test` returns status, elapsed time, and error type
only. It does not return sensitive provider payloads.

Supported provider environment variables:

```text
OPENAI_API_KEY
AZURE_OPENAI_API_KEY
DEEPSEEK_API_KEY
DASHSCOPE_API_KEY
ZHIPU_API_KEY
ARK_API_KEY
MOONSHOT_API_KEY
GEMINI_API_KEY
OPENROUTER_API_KEY
LITELLM_PROXY_API_KEY
LOCAL_OPENAI_COMPATIBLE_API_KEY
```

Local reference:

```text
apps/server/.env.example
```

PowerShell startup example:

```shell
$env:DEEPSEEK_API_KEY="replace-with-your-deepseek-key"
$env:OPENAI_API_KEY="replace-with-your-key"
mvn -f apps/server/pom.xml spring-boot:run
```

DeepSeek stage verification uses:

```text
providerKey=deepseek
baseUrl=https://api.deepseek.com
modelId=deepseek-v4-pro
apiKeyEnvName=DEEPSEEK_API_KEY
```

Use the real `DEEPSEEK_API_KEY` only as a backend process environment variable.
Do not persist it in `.env`, source code, docs, logs, H2/MySQL records, frontend
responses, or test snapshots.

The Java application reads these values from the process environment. It does
not automatically load `.env` files; use the example as deployment reference or
load it with your own local shell tooling.

## LLM Prompt And Audit

Prompt packs are bundled as classpath resources:

```text
apps/server/src/main/resources/prompts/danche-prediction-v1.md
apps/server/src/main/resources/prompts/danche-review-insight-v1.md
apps/server/src/main/resources/prompts/danche-safety-guard-v1.md
```

`OPENAI_COMPATIBLE` analysis combines the safety guard prompt and prediction
prompt. `RULE_REVIEW_WITH_LLM_INSIGHT` combines the safety guard prompt and
review insight prompt after rule-engine settlement is complete.

LLM output must pass `LlmOutputValidator` and `SafetyGuardService` before it is
returned as a usable report or insight. The validator accepts strict JSON and
complete markdown fenced JSON responses from OpenAI-compatible providers, then
applies the same required-field, budget, play-type, parlay, prohibited-term, and
review-settlement mutation checks. Blocked or failed calls still write an audit
row with `safetyStatus=BLOCKED` or `safetyStatus=ERROR`.

`llm_invocation_audit` stores:

```text
business_type
business_id
provider_key
model_id
prompt_version
input_hash
output_hash
prompt_tokens
completion_tokens
total_tokens
latency_ms
safety_status
error_code
created_at
```

It must not store API keys, full prompts, screenshots, user-uploaded raw images,
or raw model output.

## Commands

```shell
mvn -f apps/server/pom.xml test
mvn -f apps/server/pom.xml spring-boot:run
```

From the repository root, run the optional real DeepSeek integration smoke only
after setting the key in the current PowerShell session:

```shell
$env:DEEPSEEK_API_KEY="replace-with-your-deepseek-key"
npm run smoke:deepseek
```

The command performs real DeepSeek provider, prediction, and review-insight
calls with `providerKey=deepseek` and `modelId=deepseek-v4-pro`. It reports only
sanitized status and audit IDs. If the key is missing or the backend process
cannot see it, the command fails with a clear setup message instead of returning
a false pass.

The backend must not implement real purchase, payment, ticket issuing, proxy
purchase, following-order, deposit, or withdrawal capability.
