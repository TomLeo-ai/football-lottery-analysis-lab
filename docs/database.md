# Local Database Guide

Football Lottery Analysis Lab uses an H2 Embedded File database by default. The
backend starts without a separate database server, runs Flyway migrations on
startup, and stores local runtime data under `apps/server/data/`.

## Default H2 Embedded File Database

Default datasource settings are defined in
`apps/server/src/main/resources/application.yml`:

```yaml
spring:
  datasource:
    url: jdbc:h2:file:./data/football_lottery_analysis_lab;MODE=MySQL;DATABASE_TO_LOWER=TRUE
    driver-class-name: org.h2.Driver
    username: sa
    password:
  flyway:
    enabled: true
    locations: classpath:db/migration
  h2:
    console:
      enabled: true
      path: /h2-console
```

When the backend is started with Maven from the repository root:

```shell
mvn -f apps/server/pom.xml spring-boot:run
```

the Spring Boot working directory is `apps/server`, so the H2 files are created
inside:

```text
apps/server/data/
  football_lottery_analysis_lab.mv.db
  football_lottery_analysis_lab.trace.db
  football_lottery_analysis_lab.lock.db
```

The trace and lock files are created only when H2 needs them. Runtime database
files are ignored by Git through `.gitignore`:

```text
apps/server/data/
*.mv.db
*.trace.db
*.lock.db
```

## Flyway Migrations

Flyway migration files live in:

```text
apps/server/src/main/resources/db/migration/
```

The migration chain used by v0.2.0 is:

```text
V1__init_h2_schema.sql
V2__llm_invocation_audit.sql
V3__trustworthy_workflow_foundation.sql
V4__analysis_report_v2_persistence.sql
V5__workflow_operation_stale_scan_index.sql
```

V1 and V2 create the original persisted domain and LLM audit tables:

```text
screenshot_task
ocr_task
ocr_confirmed_snapshot
analysis_report
simulated_plan
simulated_plan_item
public_result_snapshot
review_record
llm_invocation_audit
```

V3 adds the trustworthy workflow foundation:

```text
ocr_workflow
workflow_operation
ocr_review_draft
```

- `ocr_workflow` is the authoritative state-machine row. Important fields are
  `workflow_id`, `current_stage`, `version`, current OCR/snapshot/report/plan
  IDs, active operation type/key, and timestamps. State transitions use
  `version` as compare-and-set (CAS), preventing two writers from silently
  advancing the same workflow.
- `workflow_operation` stores `idempotency_key`, `workflow_id`, operation type,
  `request_sha256`, status, result/error identity, HTTP status, and timestamps.
  The same key and request can be replayed without creating a second resource;
  the same key with a different request is rejected. V5 adds the stale-operation
  recovery scan index.
- `ocr_review_draft` stores one editable draft per OCR task, including
  `workflow_id`, `revision`, `draft_status`, strategy inputs, ordered
  `matches_json`, `markets_json`, `schema_version`, and `updated_at`. Draft
  updates use `expectedRevision` CAS. A persisted active draft can be restored
  after a browser refresh or backend process restart against the same database.

V3 also adds authority lineage columns to the existing records:

| Table | v0.2.0 authority fields |
| --- | --- |
| `screenshot_task` | `workflow_id`, `source_declaration`, `source_policy_version`, `authority_type`, `provenance_json`, `schema_version` |
| `ocr_task` | `workflow_id`, `candidate_schema_version`, `authority_type`, `provenance_json` |
| `ocr_confirmed_snapshot` | `workflow_id`, `confirmed_revision`, `authority_type`, `provenance_json`, `schema_version` |
| `analysis_report` | `workflow_id`, `authority_type`, `provenance_json`, `schema_version` |
| `simulated_plan` | `workflow_id`, `authority_type`, `provenance_json`, `schema_version` |

V4 completes analysis authority persistence with `authority_snapshot_id`,
`authority_revision`, `strategy_defaults_version`, and `llm_output_json`.
Composite foreign keys and unique constraints bind the chain as follows:

```text
ocr_workflow
  -> screenshot_task / ocr_task / ocr_review_draft
  -> ocr_confirmed_snapshot (one snapshot per workflow; unique OCR task/revision)
  -> analysis_report (same workflow + confirmed snapshot authority)
  -> simulated_plan (same workflow + report + snapshot authority)
```

The v0.2.0 write path requires this lineage and server-generated authority
metadata. Analysis and plan services re-read the referenced records and reject
client-asserted authority, mismatched IDs, stale revisions, and non-WDL draft
markets.

### Legacy null compatibility and API migration

Columns added by V3/V4 remain nullable so databases created by earlier versions
can be migrated without inventing authority for legacy rows. Read adapters can
still expose those historical rows through legacy-compatible read models, but a row
with null `workflow_id`/`authority_type`/`schema_version` is not eligible as a
v0.2.0 authority source. New v0.2.0 writes always populate the lineage fields.

This is a deliberate internal API breaking migration: consumers must use the
revisioned draft and confirmation endpoints. The old
`POST /api/ocr/review/confirm` route remains as an explicit HTTP 410
`LEGACY_CONFIRM_ENDPOINT_REMOVED` tombstone, so older clients receive a stable
migration signal instead of an ambiguous 404.

The H2 connection enables MySQL compatibility mode with `MODE=MySQL` and
`DATABASE_TO_LOWER=TRUE`. New migrations should keep table and column names in
lowercase snake_case and avoid H2-only SQL features whenever practical.

## H2 Console

H2 Console is enabled for local development only.

1. Start the backend:

   ```shell
   mvn -f apps/server/pom.xml spring-boot:run
   ```

2. Open:

   ```text
   http://127.0.0.1:8080/h2-console
   ```

3. Use:

   ```text
   JDBC URL: jdbc:h2:file:./data/football_lottery_analysis_lab;MODE=MySQL;DATABASE_TO_LOWER=TRUE
   User Name: sa
   Password:
   ```

Do not expose H2 Console outside local development. Keep it disabled in any
shared, hosted, or production-like environment.

## Clean Local Data

To reset local persisted data:

1. Stop the backend process.
2. Remove the local database directory:

   ```shell
   Remove-Item -LiteralPath apps/server/data -Recurse -Force
   ```

3. Start the backend again. Flyway will recreate the schema on first startup.

Do not remove H2 files while the backend is running.

## Stage 9 Isolated Verification

`npm run verify:stage9` is the current v0.2.0 release-candidate gate. Its real
browser smoke starts the packaged Web application and backend with an isolated,
temporary H2 file database. It verifies persisted editable-draft recovery across
browser refresh and backend process restart, then audits authority lineage and
storage boundaries. The temporary database is scoped to that Stage 9 run and is
removed during cleanup; it does not read, reset, or reuse
`apps/server/data/football_lottery_analysis_lab.mv.db`.

The Stage 9 browser OCR input stays in the browser. The original image and full
raw OCR text are not database fields and are not sent to this H2 database; only
the bounded, user-selected structured candidate fields and subsequent draft are
persisted.

## Stage 8 Historical Repeatability

`npm run smoke:stage8` creates fictional workflow data through the public API.
The persisted H2 database keeps this data between backend restarts. Repository
sequence restoration avoids id collisions across repeated runs, so the smoke
flow can be executed more than once against the same local database.

For a fully clean smoke run, stop the backend and remove `apps/server/data/`
before running:

```shell
npm run verify:stage8
```

Stage 8 remains a historical regression baseline. Use `npm run verify:stage9`
for the current release-candidate gate.

## Future MySQL Migration

The current default is H2 file mode. A future MySQL deployment can start from
`apps/server/src/main/resources/application-mysql.example.yml`:

```yaml
spring:
  datasource:
    url: jdbc:mysql://127.0.0.1:3306/football_lottery_analysis_lab?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
    driver-class-name: com.mysql.cj.jdbc.Driver
    username: football_lab_user
    password: change-me
  flyway:
    enabled: true
    locations: classpath:db/migration
  h2:
    console:
      enabled: false
```

Migration path:

1. Create the MySQL database, for example `football_lottery_analysis_lab`.
2. Copy `application-mysql.example.yml` to an environment-specific Spring Boot
   config file, such as `application-mysql.yml`.
3. Adjust `spring.datasource.url`, `username`, `password`, and
   `driver-class-name`.
4. Make sure the runtime includes a MySQL JDBC driver such as
   `com.mysql:mysql-connector-j` before enabling the MySQL profile.
5. Review Flyway SQL compatibility, then start the backend with the MySQL
   profile. Flyway will apply the same migration chain.

The MySQL profile should keep H2 Console disabled.

## Compliance Boundary

Persistence does not change the product boundary. The backend stores local
fictional workflow data and Mock provider snapshots only.

- No real lottery purchase, payment, ticket issuing, proxy purchase, group
  purchase, following-order, deposit, or withdrawal capability.
- No official lottery data crawling, caching, mirroring, or republishing.
- Public results remain Mock/PublicResultProvider data in the local experiment
  workflow.
- The default analysis implementation remains `MockRuleAnalysisEngine`; its
  deterministic output is simulation evidence, not official data or a real
  recommendation.
- All analysis, simulated plans, and reviews remain for learning, replay, and
  simulation only.
