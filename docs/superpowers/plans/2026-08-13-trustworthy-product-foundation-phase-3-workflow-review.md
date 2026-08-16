# Trustworthy Product Foundation Phase 3: Workflow and Editable Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a restart-safe OCR workflow, accept only minimized v2 candidates or an explicit blank-manual entry, let users edit and revision-save multiple matches, atomically confirm an immutable server-authoritative snapshot, and restore the exact workflow from its URL.

**Architecture:** A V3 Flyway migration adds `ocr_workflow`, revisioned drafts, and a durable operation ledger while leaving V1/V2 and legacy rows intact. Controllers use strict DTOs, Bean Validation, UUID idempotency headers, and a common error envelope. Transaction services own operation reservation, business insert/update, and workflow compare-and-set. Vue uses one authoritative workflow store and explicit workflow routes; transient image/OCR objects remain outside it.

**Tech Stack:** Spring Boot MVC/Validation/JDBC/Flyway/H2, Java 17 records, Vue 3, Pinia, Vue Router, TypeScript, Vitest.

---

## Task 1: Add stable API errors, trace IDs, strict JSON, and the 512 KiB boundary

**Files:**

- Create: `apps/server/src/main/java/org/footballlab/common/error/ApiError.java`
- Create: `apps/server/src/main/java/org/footballlab/common/error/ApiFieldError.java`
- Create: `apps/server/src/main/java/org/footballlab/common/error/ApiException.java`
- Create: `apps/server/src/main/java/org/footballlab/common/error/GlobalExceptionHandler.java`
- Create: `apps/server/src/main/java/org/footballlab/common/json/StrictRequestFields.java`
- Create: `apps/server/src/main/java/org/footballlab/common/web/TraceIdFilter.java`
- Create: `apps/server/src/main/java/org/footballlab/common/web/OcrRequestSizeFilter.java`
- Modify: `apps/server/src/main/java/org/footballlab/common/Result.java`
- Create: `apps/server/src/test/java/org/footballlab/common/GlobalExceptionHandlerTest.java`
- Create: `apps/server/src/test/java/org/footballlab/common/StrictRequestFieldsTest.java`
- Create: `apps/server/src/test/java/org/footballlab/common/OcrRequestSizeFilterTest.java`

- [ ] **Step 1: Write RED MVC tests**

Assert exact error shape, `application/json`, stable `errorCode`, field paths, trace ID, no exception/body echo, unknown-property 400, malformed JSON 400, and OCR candidate/draft body over 512 KiB returning 413 `REQUEST_TOO_LARGE`. Assert an existing successful controller still serializes only `code/msg/data`.

- [ ] **Step 2: Run RED**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=GlobalExceptionHandlerTest,StrictRequestFieldsTest,OcrRequestSizeFilterTest" test
```

- [ ] **Step 3: Extend `Result` compatibly**

Use `@JsonInclude(NON_NULL)` and preserve the success factory:

```java
public record Result<T>(int code, String msg, T data, ApiError error) {
    public Result(int code, String msg, T data) { this(code, msg, data, null); }
    public static <T> Result<T> success(T data) { return new Result<>(200, "success", data, null); }
    public static <T> Result<T> success(int status, T data) { return new Result<>(status, "success", data, null); }
}
```

Existing 200 responses keep `success(data)`. New create responses use `success(201, data)` so the HTTP status and envelope code agree; idempotency replay persists and restores that original status. `ApiException` carries HTTP status, approved error code, safe message, field errors, and optional safe recovery data. The advice maps validation, unreadable JSON, request-size, conflicts, and uncaught errors without logging request content.

- [ ] **Step 4: Scope strict-property checking to v2 DTOs**

Do not globally enable Jackson `FAIL_ON_UNKNOWN_PROPERTIES`. New/changed request records use an `@JsonAnySetter` delegating to `StrictRequestFields.reject(name)`, or an equivalent per-DTO strict deserializer, so legacy read DTOs remain compatible.

- [ ] **Step 5: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=GlobalExceptionHandlerTest,StrictRequestFieldsTest,OcrRequestSizeFilterTest" test
git add apps/server/src/main/java/org/footballlab/common apps/server/src/test/java/org/footballlab/common
git commit -m "feat: add strict workflow API errors"
```

## Task 2: Add the compatible V3 workflow schema

**Files:**

- Create: `apps/server/src/main/resources/db/migration/V3__trustworthy_workflow_foundation.sql`
- Create: `apps/server/src/test/resources/fixtures/v1-v2-legacy-workflow.sql`
- Create: `apps/server/src/test/resources/fixtures/v1-v2-legacy-payloads/`
- Create: `apps/server/src/test/java/org/footballlab/persistence/V3LegacyMigrationTest.java`
- Modify: `apps/server/src/test/java/org/footballlab/persistence/DatabaseSchemaMigrationTest.java`
- Never modify: `apps/server/src/main/resources/db/migration/V1__init_h2_schema.sql`
- Never modify: `apps/server/src/main/resources/db/migration/V2__llm_invocation_audit.sql`

- [ ] **Step 1: Create a real legacy-upgrade RED test**

Use a temporary file H2 URL. Run Flyway to target `2`, insert the checked-in sanitized screenshot/OCR/snapshot/report/generated plan/pending plan/review fixture (including a deliberately orphaned legacy reference and a `HANDICAP_WIN_DRAW_LOSS` plan), then migrate to `3`. Initially expect target 3 and new tables/columns; observe RED because V3 is absent.

- [ ] **Step 2: Write the complete V3 migration**

Create these structures exactly:

```sql
create table ocr_workflow (
  workflow_id varchar(64) primary key,
  current_stage varchar(64) not null,
  version bigint not null,
  current_ocr_task_id varchar(64),
  confirmed_snapshot_id varchar(64),
  current_report_id varchar(64),
  current_plan_id varchar(64),
  active_operation_type varchar(64),
  active_operation_key varchar(64),
  created_at varchar(64) not null,
  updated_at varchar(64) not null
);

create table workflow_operation (
  idempotency_key varchar(64) primary key,
  workflow_id varchar(64),
  operation_type varchar(64) not null,
  request_sha256 varchar(64) not null,
  operation_status varchar(32) not null,
  result_type varchar(64),
  result_id varchar(64),
  error_code varchar(128),
  http_status integer,
  created_at varchar(64) not null,
  updated_at varchar(64) not null,
  constraint fk_workflow_operation_workflow foreign key (workflow_id)
    references ocr_workflow(workflow_id)
);

create table ocr_review_draft (
  ocr_task_id varchar(64) primary key,
  workflow_id varchar(64) not null,
  revision bigint not null,
  draft_status varchar(32) not null,
  risk_preference varchar(64),
  budget_amount decimal(18,2),
  currency varchar(16),
  matches_json clob not null,
  markets_json clob not null,
  schema_version varchar(64) not null,
  updated_at varchar(64) not null,
  constraint fk_review_draft_ocr_task foreign key (ocr_task_id) references ocr_task(ocr_task_id),
  constraint fk_review_draft_workflow foreign key (workflow_id) references ocr_workflow(workflow_id)
);
```

Add stage/update, operation workflow/status, and draft workflow indexes. Add nullable `workflow_id` and v2 authority/provenance columns to screenshot/OCR/snapshot/report/plan; add `confirmed_revision`; widen `simulated_plan_item.odds` to `DECIMAL(18,4)`. Use nullable v2 authority references plus composite unique/FK constraints so new snapshot→report→plan lineage belongs to one workflow, while legacy authority columns remain null. Add `UNIQUE(workflow_id)` on v2 snapshot/report/plan and `UNIQUE(ocr_task_id, confirmed_revision)`.

Do not backfill or invent workflow IDs for legacy rows. Keep `file_name` and `raw_text` compatibility columns.

- [ ] **Step 3: Assert real constraint behavior**

Extend schema tests to insert invalid v2 duplicates and unrelated workflow/snapshot/report combinations; expect unique/FK failures. Prove a valid four-decimal odds value round-trips without loss, and put five-decimal rejection in the request/service validation tests rather than assuming H2/MySQL `DECIMAL` will reject instead of round. Assert the legacy orphan survives with nullable authority columns, old plan/review JSON remains byte-identical, and legacy handicap stays readable.

- [ ] **Step 4: Run GREEN**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=DatabaseSchemaMigrationTest,V3LegacyMigrationTest" test
```

- [ ] **Step 5: Commit**

```powershell
git add apps/server/src/main/resources/db/migration/V3__trustworthy_workflow_foundation.sql apps/server/src/test/resources/fixtures apps/server/src/test/java/org/footballlab/persistence
git commit -m "feat: add trustworthy workflow schema"
```

## Task 3: Implement workflow and operation repository primitives

**Files:**

- Create: `apps/server/src/main/java/org/footballlab/workflow/domain/WorkflowStage.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/domain/WorkflowOperationType.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/domain/WorkflowOperationStatus.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/domain/WorkflowRecord.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/domain/WorkflowOperationRecord.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/repository/WorkflowRepository.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/repository/JdbcWorkflowRepository.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/repository/WorkflowOperationRepository.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/repository/JdbcWorkflowOperationRepository.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/service/RequestHashService.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/service/WorkflowOperationService.java`
- Create: `apps/server/src/test/java/org/footballlab/workflow/WorkflowRepositoryTest.java`
- Create: `apps/server/src/test/java/org/footballlab/workflow/WorkflowOperationIdempotencyTest.java`

- [ ] **Step 1: Write repository RED tests**

Test all legal/illegal stage transitions, CAS version mismatch, active-operation claim/clear keyed by operation key, same-key/same-hash replay, same-key/different-operation/hash conflict, `IN_PROGRESS`, stable failed/interrupted responses, original HTTP status replay, and persistence through a new Spring context.

- [ ] **Step 2: Implement canonical hashing**

Hash UTF-8 canonical JSON containing HTTP method, normalized path, operation type, parent IDs, expected revision/version, and normalized DTO fields in deterministic key order. UUID/enums are canonical uppercase values; decimal values use plain normalized strings. Never hash API keys, raw JSON bytes, trace IDs, or timestamps.

- [ ] **Step 3: Implement single-statement CAS operations**

Repository transitions use SQL shaped like:

```sql
update ocr_workflow
set current_stage=?, version=version+1, current_ocr_task_id=?, updated_at=?
where workflow_id=? and version=? and current_stage=?
```

Affected rows other than one produce a structured 409 with current stage/version/current IDs. Active claims require current stage and both active columns null; clear requires matching type and key.

`OcrRequestSizeFilter` must reject an oversized positive `Content-Length` before parsing and also wrap/count the input stream so chunked or missing-length bodies cannot bypass the 512 KiB limit.

Operation handling must distinguish validation before reservation from failure after reservation. Syntax, UUID, body-size, and unknown-property failures do not create an operation row. After reservation, a business validation failure commits the operation as `FAILED` with its stable error code while leaving no business resource. An unexpected database failure rolls back partial business rows, then a separate short failure transaction records the same key/hash as `FAILED`; it never leaves an ambiguous successful resource. Tests must replay both failure classes with the same key and prove business logic does not run again.

- [ ] **Step 4: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=WorkflowRepositoryTest,WorkflowOperationIdempotencyTest" test
git add apps/server/src/main/java/org/footballlab/workflow apps/server/src/test/java/org/footballlab/workflow
git commit -m "feat: persist workflow operations and transitions"
```

## Task 4: Create, read, and abandon a workflow idempotently

**Files:**

- Modify: `apps/server/src/main/java/org/footballlab/ocr/domain/ScreenshotTaskCreateRequest.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/domain/ScreenshotTaskResponse.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/domain/OcrWorkflowResponse.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/service/OcrWorkflowTransactionService.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/controller/OcrWorkflowController.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/service/OcrWorkflowService.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/service/OcrWorkflowServiceImpl.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/repository/OcrWorkflowRepository.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/repository/JdbcOcrWorkflowRepository.java`
- Modify: `apps/server/src/test/java/org/footballlab/ocr/OcrWorkflowControllerTest.java`
- Create: `apps/server/src/test/java/org/footballlab/ocr/OcrWorkflowStateMachineTest.java`
- Create: `apps/server/src/test/java/org/footballlab/ocr/OcrWorkflowRestartRecoveryTest.java`

- [ ] **Step 1: Write RED HTTP tests for the exact body/header**

The create body is exactly:

```json
{"sourceDeclaration":"FICTIONAL_SAMPLE","sourcePolicyVersion":"SOURCE_POLICY_V2","contentType":"image/png","byteSize":1234,"width":1200,"height":800}
```

Require UUID `Idempotency-Key`; reject `fileName`, `image`, `rawText`, unknown fields, unsupported MIME, bad sizes, and missing/invalid source declaration or policy version. The three `USER_OWNED_AUTHORIZED` acknowledgements remain a required browser-side gate and are intentionally not transmitted or persisted. Expect first success `201` in both HTTP and `Result.code`; same key/body returns the same status/workflow/task; same key/different body returns 409. GET returns the aggregate; DELETE works only in pre-confirm stages and same-key replay returns the original 204.

- [ ] **Step 2: Implement one create transaction**

Reserve the create operation with nullable workflow ID, generate UUID-based IDs such as `workflow-550e8400-e29b-41d4-a716-446655440000` and `screenshot-550e8400-e29b-41d4-a716-446655440001`, write workflow plus screenshot, backfill the operation's workflow/result IDs, set `file_name='local-image'`, write no image/original file name, and complete the operation. All writes use one transaction. A failure leaves no partial workflow/screenshot and follows the stable operation-failure rule from Task 3.

- [ ] **Step 3: Implement aggregate GET and privacy deletion**

GET uses structured stage/version/current IDs and includes the current draft/snapshot/report/plan summary only when owned by that workflow. DELETE clears candidate/draft/task payload/body fields and leaves the minimal `ABANDONED` tombstone plus operation replay data.

- [ ] **Step 4: Prove process restart recovery**

The restart test closes one application context, opens another against the same temporary file H2, and replays the same create key/body plus GET. It must return the original workflow, not create another.

- [ ] **Step 5: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=OcrWorkflowControllerTest,OcrWorkflowStateMachineTest,OcrWorkflowRestartRecoveryTest,WorkflowOperationIdempotencyTest" test
git add apps/server/src/main/java/org/footballlab/ocr apps/server/src/test/java/org/footballlab/ocr
git commit -m "feat: persist recoverable OCR workflows"
```

## Task 5: Accept minimized OCR candidates or a blank manual draft

**Files:**

- Create: `apps/server/src/main/java/org/footballlab/ocr/domain/OcrBoundingBoxRequest.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/domain/OcrCandidateFieldRequest.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/domain/LocalOcrParseRequest.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/domain/OcrTaskResponse.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/persistence/OcrCandidatePayloadV2.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/persistence/OcrReviewDraftPayloadV2.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/repository/OcrReviewDraftRepository.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/repository/JdbcOcrReviewDraftRepository.java`
- Create: `apps/server/src/test/java/org/footballlab/ocr/OcrCandidateValidationTest.java`
- Create: `apps/server/src/test/java/org/footballlab/ocr/OcrPayloadPrivacyTest.java`

- [ ] **Step 1: Write exhaustive RED tests**

Cover the approved MATCH/MARKET field-name whitelist, 256 field cap, 512-character value cap, UUID keys, tuple uniqueness, one market per match, mandatory `matchRef`, no orphan, confidence, bbox bounds/transform metadata, first-seen ordering, OCR vs `MANUAL_BLANK` conditional fields, `replaceDraft`, and every forbidden sensitive property/signature.

- [ ] **Step 2: Replace the legacy parse DTO**

The v2 record contains only schema/workflow/task/version/replace/entry mode, OCR engine/version/languages/outcome, processed dimensions/rotation/crop schema/redaction count, and candidate fields. It has no `fileName`, image, `rawText`, word list, or free-form map.

- [ ] **Step 3: Implement transactional parse/replace**

Reserve/replay the parse operation before business writes. From `WAITING_LOCAL_OCR`, create an OCR task and revision-0 draft then CAS to `WAITING_USER_CONFIRMATION` and complete the operation in one transaction. In `WAITING_USER_CONFIRMATION`, require `replaceDraft=true`, mark the prior task/draft `SUPERSEDED`, insert replacements, keep the stage, and complete the operation. New `ocr_task.raw_text` is always SQL NULL; candidate JSON is a versioned payload. Same key/hash replays the original 201; a new key against an already advanced version returns 409.

- [ ] **Step 4: Run GREEN and inspect persisted columns**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=OcrCandidateValidationTest,OcrPayloadPrivacyTest,OcrWorkflowStateMachineTest,OcrWorkflowRepositoryTest" test
```

Assert raw text NULL and no sentinel/file name/image encoding in any OCR/workflow payload.

- [ ] **Step 5: Commit**

```powershell
git add apps/server/src/main/java/org/footballlab/ocr apps/server/src/test/java/org/footballlab/ocr
git commit -m "feat: persist minimized OCR review drafts"
```

## Task 6: Save and validate an editable review draft

**Files:**

- Create: `apps/server/src/main/java/org/footballlab/ocr/domain/DraftMatchRequest.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/domain/DraftMarketRequest.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/domain/OcrReviewDraftUpdateRequest.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/domain/OcrReviewDraftResponse.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/controller/OcrReviewDraftController.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/service/OcrReviewDraftService.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/service/OcrReviewDraftServiceImpl.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/service/OcrDraftValidator.java`
- Create: `apps/server/src/test/java/org/footballlab/ocr/OcrReviewDraftControllerTest.java`

- [ ] **Step 1: Write RED validation/revision tests**

Cover incomplete draft save, 1–64 match final limits, stable array order, UUID uniqueness, orphan/duplicate market, exact WDL/selection enums, odds 1.01–1000 with four decimals, CNY, budget 0.01–1,000,000 with two decimals, risk enum, NFC/trim, same team case-insensitive, offset datetime/date consistency, missing/unknown fields, idempotency same-key replay/different-payload rejection, and concurrent expected revision conflicts.

- [ ] **Step 2: Implement optimistic-lock update**

Reserve/replay a `SAVE_DRAFT` operation using the normalized full draft plus expected revision. Use one statement:

```sql
update ocr_review_draft
set revision=revision+1, risk_preference=?, budget_amount=?, currency=?,
    matches_json=?, markets_json=?, updated_at=?
where ocr_task_id=? and workflow_id=? and revision=? and draft_status='ACTIVE'
```

Saving can return warnings and incomplete field errors but does not confirm. The update and operation success are one transaction. Same key/hash replays the original 200 and revision; the same key with changed draft is `IDEMPOTENCY_KEY_REUSED`. A zero update returns 409 `DRAFT_REVISION_CONFLICT` with current revision.

- [ ] **Step 3: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=OcrReviewDraftControllerTest,OcrCandidateValidationTest" test
git add apps/server/src/main/java/org/footballlab/ocr apps/server/src/test/java/org/footballlab/ocr/OcrReviewDraftControllerTest.java
git commit -m "feat: save revisioned OCR review drafts"
```

## Task 7: Confirm one immutable server-authoritative snapshot

**Files:**

- Modify: `apps/server/src/main/java/org/footballlab/ocr/domain/OcrReviewConfirmRequest.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/domain/UserConfirmedSnapshotResponse.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/domain/ConfirmedMatchResponse.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/domain/ConfirmedMarketResponse.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/persistence/ConfirmedSnapshotPayloadV2.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/service/OcrConfirmationService.java`
- Create: `apps/server/src/main/java/org/footballlab/ocr/service/OcrConfirmationServiceImpl.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/controller/OcrReviewDraftController.java`
- Modify: `apps/server/src/main/java/org/footballlab/ocr/controller/OcrWorkflowController.java`
- Create: `apps/server/src/test/java/org/footballlab/ocr/OcrConfirmControllerTest.java`
- Create: `apps/server/src/test/java/org/footballlab/ocr/OcrConfirmConcurrencyTest.java`
- Create: `apps/server/src/test/java/org/footballlab/ocr/LegacyOcrCompatibilityTest.java`

- [ ] **Step 1: Write RED contract and rollback tests**

Confirm body contains exactly one numeric `expectedRevision` property. Reject matches/markets/authority fields. Test invalid draft 422, wrong stage/revision 409, missing parent 404, same-key replay, different-key duplicate, two-key concurrency, formal IDs differing from draft UUIDs, snapshot immutability, candidate/draft clearing, and forced insert failure leaving no partial snapshot/workflow/clearing while persisting the stable failed operation outcome.

- [ ] **Step 2: Implement one confirmation transaction**

Reserve operation; load current workflow/task/draft; fully validate; create formal UUID match/market IDs preserving order; insert `SERVER_CONFIRMED_V2`, `USER_SCREENSHOT_CONFIRMED`, `CONFIRMED`, `analysisAllowed=true`; set candidate fields/payloads to null for every OCR task in the workflow and delete every active/superseded draft row in that workflow; CAS workflow; complete operation. All of these writes share one transaction. The first response is 201 in HTTP and `Result.code`; same-key replay restores that 201 and the same snapshot. The database unique constraints are the final concurrent-create guard.

- [ ] **Step 3: Keep the old endpoint as a fixed tombstone**

`POST /api/ocr/review/confirm` returns HTTP 410 `LEGACY_CONFIRM_ENDPOINT_REMOVED` without parsing or using its request body. Add a test with malformed/large legacy JSON proving business code is not called.

- [ ] **Step 4: Add snapshot GET and legacy boundary**

`GET /api/ocr/snapshots/{snapshotId}` reads both formats; v2 returns authority metadata, legacy returns `LEGACY_V1` and remains read-only. No service may promote legacy to v2.

- [ ] **Step 5: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=OcrConfirmControllerTest,OcrConfirmConcurrencyTest,LegacyOcrCompatibilityTest,OcrWorkflowRepositoryTest" test
git add apps/server/src/main/java/org/footballlab/ocr apps/server/src/test/java/org/footballlab/ocr
git commit -m "feat: confirm immutable v2 snapshots"
```

## Task 8: Add the strict Web API and pending-create replay

**Files:**

- Create: `apps/web/src/types/api.ts`
- Create: `apps/web/src/api/http.ts`
- Modify: `apps/web/src/types/ocrWorkflow.ts`
- Rewrite: `apps/web/src/api/ocrWorkflow.ts`
- Create: `apps/web/src/workflow/workflowSession.ts`
- Create: `apps/web/src/workflow/workflowSession.spec.ts`
- Modify: all Web API files importing `ApiResult` from `types/officialLink.ts`

- [ ] **Step 1: Write RED request-shape tests**

Capture create/parse/save/confirm/abandon requests and assert exact paths, methods, idempotency headers, and property allowlists. Prove no file name/image/raw OCR/words appear. Test that `pendingCreate={idempotencyKey,request}` is synchronously written before fetch, survives a simulated lost response, replays byte-equivalent normalized JSON with the same key, then is removed as one unit after success.

- [ ] **Step 2: Implement typed error parsing and write APIs**

`requestJson<T>` throws `ApiRequestError` carrying status/errorCode/fieldErrors/traceId/recovery data and never logs the body. Every write requires its caller to supply a UUID key.

- [ ] **Step 3: Implement versioned session keys**

Session storage may contain only `football-lab:v2:workflowId` and `football-lab:v2:pendingCreate`. Reject/clear malformed values. Never infer a lost request from a lost `File`.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm.cmd run test -w apps/web -- src/workflow/workflowSession.spec.ts src/api
npm.cmd run lint:web
git add apps/web/src/types apps/web/src/api apps/web/src/workflow
git commit -m "feat: add strict workflow Web API"
```

## Task 9: Connect the editable Review UI to revisioned persistence

**Files:**

- Modify: `apps/web/src/review/reviewDraftValidation.ts`
- Modify: `apps/web/src/review/reviewDraftValidation.spec.ts`
- Modify: `apps/web/src/components/ocr/OcrCandidateEvidence.vue`
- Modify: `apps/web/src/components/ocr/ReviewDraftEditor.vue`
- Modify: `apps/web/src/components/ocr/ReviewMatchCard.vue`
- Modify: `apps/web/src/components/ocr/ReviewMarketFields.vue`
- Modify: `apps/web/src/views/OcrReviewWizard.vue`
- Modify: `apps/web/src/views/OcrReviewWizard.spec.ts`

- [ ] **Step 1: Extend the local component tests with persistence RED cases**

Edit two matches/two markets, add/delete/reorder, confirm cascading removal of a referenced market, reject a second market for one match, preserve UUIDs/order across save, show candidate vs final value, warn low confidence, locate server field errors, and keep unsaved edits after a 409 revision conflict while offering explicit reload/compare.

- [ ] **Step 2: Keep local validation aligned without making it authoritative**

Reuse the Phase 2 model and mirror any now-final server constraints for fast feedback. Server errors remain final. Match deletion stays one editor transaction that removes its exactly-one market only after confirmation.

- [ ] **Step 3: Separate save from confirm**

Save sends the complete draft plus `expectedRevision`; on success replace the local baseline/revision. Confirm sends only the current `expectedRevision`; it is disabled while dirty or locally invalid. Never manufacture formal IDs.

- [ ] **Step 4: Connect Phase 2 local OCR**

`ScreenshotUpload.vue` first creates/replays the workflow, then submits candidate-only parse (or `MANUAL_BLANK`), clears raw recognition state, and navigates to `/workflows/:workflowId/ocr-review`. A parse failure leaves the local workbench available for retry but never falls back to legacy raw-text API.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npm.cmd run test -w apps/web -- src/review/reviewDraftValidation.spec.ts src/views/ScreenshotUpload.spec.ts src/views/OcrReviewWizard.spec.ts
npm.cmd run lint:web
npm.cmd run build:web
git add apps/web/src/review apps/web/src/components/ocr apps/web/src/views/ScreenshotUpload.vue apps/web/src/views/ScreenshotUpload.spec.ts apps/web/src/views/OcrReviewWizard.vue apps/web/src/views/OcrReviewWizard.spec.ts
git commit -m "feat: connect revisioned OCR review"
```

## Task 10: Hydrate explicit workflow routes without cross-workflow fallback

**Files:**

- Rewrite: `apps/web/src/stores/ocrWorkflow.ts`
- Create: `apps/web/src/stores/ocrWorkflow.spec.ts`
- Create: `apps/web/src/views/WorkflowShell.vue`
- Create: `apps/web/src/views/LegacyWorkflowEntry.vue`
- Rewrite: `apps/web/src/router/index.ts`
- Rewrite: `apps/web/src/router/index.spec.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/views/Dashboard.vue`
- Modify: `apps/web/src/views/MatchWorkspace.vue`

- [ ] **Step 1: Write RED store/router race tests**

Test `IDLE/LOADING/READY/ERROR`, explicit URL priority, session fallback only when no URL ID, explicit 404 with no fallback, two stores/tabs using different IDs, stale response token suppression, atomic detail hydration, stage-gated child routes, deep-link reload, and child resource ownership.

- [ ] **Step 2: Implement one authority store**

The store owns workflow aggregate, review draft, snapshot/report/plan caches by ID, and a monotonic hydration token. It fetches aggregate, fetches referenced details, validates ownership, then commits once. Local OCR `File`/controller/raw text never enter this store.

- [ ] **Step 3: Implement route factory and named paths**

Create `/workflows/:workflowId/ocr`, `/ocr-review`, `/match-workspace`, `/analysis`, `/plans`, and `/plans/:planId`. Child `meta.allowedStages` is enforced by `WorkflowShell`. Old static routes use `LegacyWorkflowEntry`; they redirect only when this tab has a valid session ID.

- [ ] **Step 4: Run GREEN and the Phase 3 gate**

```powershell
npm.cmd run test -w apps/web -- src/stores/ocrWorkflow.spec.ts src/router/index.spec.ts
npm.cmd run lint:web
npm.cmd run test:web
npm.cmd run build:web
mvn.cmd -f apps/server/pom.xml verify
npm.cmd run compliance:scan
git diff --check
```

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/stores/ocrWorkflow.ts apps/web/src/stores/ocrWorkflow.spec.ts apps/web/src/views/WorkflowShell.vue apps/web/src/views/LegacyWorkflowEntry.vue apps/web/src/router apps/web/src/main.ts apps/web/src/App.vue apps/web/src/views/Dashboard.vue apps/web/src/views/MatchWorkspace.vue
git commit -m "feat: hydrate workflow routes from server"
```

## Phase 3 manual checkpoint

Create a fictional workflow, run OCR, edit two matches with exactly one selected WDL market each, save, refresh the deep link, restart the backend against the same local H2, reopen the URL, and confirm. Expected: revision and order survive; the image must be reselected only before parse; confirmed data has server-generated IDs; old candidates are cleared; the old confirm endpoint returns 410; a second tab with another workflow never overwrites the first.
