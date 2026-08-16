# Trustworthy Product Foundation Phase 4: Authoritative Analysis and Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a confirmed v2 snapshot the only authority for analysis, make a persisted safe report the only authority for plan generation, prevent duplicate external LLM calls/resources under retry or concurrency, and keep generated plan items immutable when the user saves the plan.

**Architecture:** Wire DTOs contain only IDs, explicit engine selection, and approved non-authority options. Services load v2 parent records and build internal frozen inputs. Rule analysis completes in one transaction; external analysis uses a claim transaction, a transaction-free Provider call, and a completion/failure transaction. Plan generation is database-only and uses the same operation/active-claim rules. Structured v2 columns and versioned payloads cross-check each other and fail closed; legacy adapters remain read-only.

**Tech Stack:** Spring Boot, Spring JDBC transactions, H2/Flyway V3 structures from Phase 3, Java 17 records, Jackson strict DTO handling, Vue/TypeScript API clients, deterministic fake LLM transports in tests.

---

## Task 1: Resolve the exact v2 analysis options and WDL-only strategy

**Files:**

- Create: `apps/server/src/main/java/org/footballlab/analysis/domain/AnalysisOptionsRequest.java`
- Create: `apps/server/src/main/java/org/footballlab/strategy/domain/ResolvedStrategyParameters.java`
- Create: `apps/server/src/main/java/org/footballlab/strategy/service/AnalysisOptionsResolver.java`
- Modify: `apps/server/src/main/java/org/footballlab/strategy/service/StrategyParameterDefaultsService.java`
- Modify: `apps/server/src/main/java/org/footballlab/strategy/service/StrategyParameterValidator.java`
- Modify: `apps/server/src/main/java/org/footballlab/llm/service/LlmOutputValidator.java`
- Create: `apps/server/src/test/java/org/footballlab/strategy/AnalysisOptionsResolverTest.java`
- Modify: `apps/server/src/test/java/org/footballlab/strategy/StrategyParameterValidatorTest.java`
- Modify: `apps/server/src/test/java/org/footballlab/llm/LlmOutputValidatorTest.java`
- Preserve: `apps/server/src/main/java/org/footballlab/strategy/domain/StrategyParameterRequest.java`

- [ ] **Step 1: Write the RED default/range matrix**

Test null options, every single partial field, min/target/max relation, ratio sum exactly 1.00 without auto-rescale, two-decimal ratio/cost precision, dynamic `min(2.00,budget)`, dynamic `min(4,matchCount)`, max legs `min(10,matchCount)`, finite JSON numbers, payout/cost bounds, and exact `NONE/LIGHT/BALANCED/STRONG` enum.

The 12 optional request fields are:

```java
public record AnalysisOptionsRequest(
    Integer targetTicketCount,
    Integer minTicketCount,
    Integer maxTicketCount,
    BigDecimal mainTicketRatio,
    BigDecimal defensiveTicketRatio,
    BigDecimal entertainmentTicketRatio,
    Boolean enableEntertainmentTicket,
    BigDecimal entertainmentTicketMaxCost,
    Integer maxParlayLegs,
    BigDecimal minPayoutRequirement,
    Boolean allowLowReturnTicket,
    String upsetCoverageLevel
) {}
```

- [ ] **Step 2: Run RED**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=AnalysisOptionsResolverTest,StrategyParameterValidatorTest,LlmOutputValidatorTest" test
```

- [ ] **Step 3: Implement a frozen resolved type**

`ResolvedStrategyParameters` contains all 12 resolved values plus snapshot-owned `budgetAmount`, `currency`, `riskPreference`, fixed `preferredPlayTypes=[WIN_DRAW_LOSS]`, fixed `excludedPlayTypes=[]`, fixed `exactScorePolicy=DISABLED`, and `defaultsVersion=STRATEGY_DEFAULTS_V2`. Do not read the mutable global default registry when resolving a v2 analysis.

- [ ] **Step 4: Enforce WDL independently**

The strategy validator rejects non-WDL new writes. `LlmOutputValidator` rejects non-WDL/unknown selection even if a corrupted confirmed-market list contains it. Keep legacy `StrategyParameterRequest` deserialization so old report/plan/review payloads remain readable.

- [ ] **Step 5: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=AnalysisOptionsResolverTest,StrategyParameterValidatorTest,LlmOutputValidatorTest" test
git add apps/server/src/main/java/org/footballlab/analysis/domain/AnalysisOptionsRequest.java apps/server/src/main/java/org/footballlab/strategy apps/server/src/main/java/org/footballlab/llm/service/LlmOutputValidator.java apps/server/src/test/java/org/footballlab/strategy apps/server/src/test/java/org/footballlab/llm/LlmOutputValidatorTest.java
git commit -m "feat: freeze v2 analysis strategy options"
```

## Task 2: Separate the wire request from authoritative engine input

**Files:**

- Rewrite: `apps/server/src/main/java/org/footballlab/analysis/domain/AnalysisGenerateRequest.java`
- Create: `apps/server/src/main/java/org/footballlab/analysis/domain/ResolvedAnalysisEngineConfiguration.java`
- Create: `apps/server/src/main/java/org/footballlab/analysis/service/AnalysisEngineConfigurationResolver.java`
- Create: `apps/server/src/main/java/org/footballlab/analysis/service/AuthoritativeAnalysisInput.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/service/AnalysisEngineContext.java`
- Modify: `apps/server/src/main/java/org/footballlab/llm/service/PromptContextBuilder.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/service/MockRuleAnalysisEngine.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/service/OpenAiCompatibleAnalysisEngine.java`
- Modify: `apps/server/src/test/java/org/footballlab/analysis/AnalysisEngineTest.java`
- Modify: `apps/server/src/test/java/org/footballlab/llm/PromptContextBuilderTest.java`

- [ ] **Step 1: Write RED engine-configuration tests**

Use this exact matrix:

```text
MOCK_RULE_ENGINE: providerKey/modelId/promptVersion absent
OPENAI_COMPATIBLE: registered providerKey and explicit trimmed 1..128 modelId required;
                   prompt absent resolves to danche-prediction-v1;
                   non-empty prompt must equal danche-prediction-v1
```

Reject null/unknown/`USE_GLOBAL`, Mock with any LLM field, unknown provider, blank/long model, unknown prompt, and extra nested/top-level fields before operation reservation or transport invocation.

The canonical request hash includes explicit provider/model, the fixed resolved prompt version, frozen `STRATEGY_DEFAULTS_V2` options, and the immutable snapshot ID. It never uses a mutable provider-registry default, API key, timestamp, or transport detail. Replaying the same wire request after registry changes or process restart must therefore produce the same hash and resolved configuration.

- [ ] **Step 2: Rewrite the wire DTO**

It contains only `snapshotId`, `engineMode`, `providerKey`, `modelId`, `promptVersion`, and strict nested `analysisOptions`. Old `sourceType`, `analysisAllowed`, risk/budget/currency, strategy object, matches, and markets must be rejected as `CLIENT_ASSERTED_AUTHORITY_NOT_ALLOWED`, not ignored.

- [ ] **Step 3: Build an internal input from persisted data**

`AuthoritativeAnalysisInput` contains workflow/snapshot IDs, authority/source/status, immutable matches/markets, budget/currency/risk, and confirmed timestamp. `AnalysisEngineContext` contains that input, resolved strategy, resolved engine configuration, reserved report ID, and generated time—never the wire request.

- [ ] **Step 4: Convert both engines and prompt builder**

Every engine reads matches/markets only from `AuthoritativeAnalysisInput`. Add a second WDL/selection assertion during snapshot→engine conversion. The resolved provider/model/prompt are frozen in context; API key lookup happens only at invocation and is absent from context persistence/hash/logging.

- [ ] **Step 5: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=AnalysisEngineTest,PromptContextBuilderTest,ProviderRegistryTest" test
git add apps/server/src/main/java/org/footballlab/analysis apps/server/src/main/java/org/footballlab/llm/service/PromptContextBuilder.java apps/server/src/test/java/org/footballlab/analysis apps/server/src/test/java/org/footballlab/llm/PromptContextBuilderTest.java
git commit -m "refactor: isolate authoritative analysis input"
```

## Task 3: Persist and read v2 reports without trusting legacy payload JSON

**Files:**

- Create: `apps/server/src/main/java/org/footballlab/analysis/persistence/AnalysisReportPayloadV2.java`
- Create: `apps/server/src/main/java/org/footballlab/analysis/persistence/AnalysisReportV2Record.java`
- Create: `apps/server/src/main/java/org/footballlab/analysis/persistence/LegacyAnalysisReportAdapter.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/domain/AnalysisReportResponse.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/repository/AnalysisReportRepository.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/repository/JdbcAnalysisReportRepository.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/controller/AnalysisController.java`
- Modify: `apps/server/src/test/java/org/footballlab/analysis/AnalysisReportRepositoryTest.java`
- Create: `apps/server/src/test/java/org/footballlab/analysis/AnalysisLegacyCompatibilityTest.java`

- [ ] **Step 1: Write RED persistence tests**

Test v2 roundtrip/restart, exact workflow/snapshot/authority/defaults/options/provider/model/prompt/safety values, `GET /api/analysis/reports/{id}`, legacy payload with no v2 fields, and deliberate splits between structured columns and payload/projected JSON. V2 splits fail closed with a stable integrity error; legacy remains readable but not analyzable.

- [ ] **Step 2: Add versioned persistence records**

`AnalysisReportPayloadV2` starts with `schemaVersion=ANALYSIS_REPORT_V2`; it is not an API response record. Repository methods are explicit:

```java
void insertV2(AnalysisReportV2Record report);
Optional<AnalysisReportV2Record> findV2ById(String reportId);
Optional<AnalysisReportV2Record> findV2ByWorkflowId(String workflowId);
Optional<AnalysisReportResponse> findAnyById(String reportId);
```

- [ ] **Step 3: Cross-check authority columns**

For v2, `workflow_id`, `authority_snapshot_id`, authority version, status/safety, strategy/default versions, and payload IDs must agree. For legacy, read only through `LegacyAnalysisReportAdapter` and never synthesize v2 authority.

- [ ] **Step 4: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=AnalysisReportRepositoryTest,AnalysisLegacyCompatibilityTest" test
git add apps/server/src/main/java/org/footballlab/analysis apps/server/src/test/java/org/footballlab/analysis
git commit -m "feat: persist authoritative v2 reports"
```

## Task 4: Generate rule-engine reports in one transaction

**Files:**

- Create: `apps/server/src/main/java/org/footballlab/analysis/service/AnalysisEngineResult.java`
- Create: `apps/server/src/main/java/org/footballlab/analysis/service/AnalysisTransactionCoordinator.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/service/AnalysisService.java`
- Rewrite: `apps/server/src/main/java/org/footballlab/analysis/service/AnalysisServiceImpl.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/controller/AnalysisController.java`
- Rewrite: `apps/server/src/test/java/org/footballlab/analysis/AnalysisControllerTest.java`
- Create: `apps/server/src/test/java/org/footballlab/analysis/AnalysisAuthorityControllerTest.java`

- [ ] **Step 1: Replace the fake-parent success test with a closed chain**

Seed a real v2 workflow and snapshot from Phase 3. POST only the strict body/header; expect 201. Assert report match/market/budget/risk/authority fields equal the database snapshot. Add missing, legacy, unconfirmed, unrelated workflow, wrong current snapshot, and old authority-field negative tests.

- [ ] **Step 2: Implement a separate transactional coordinator bean**

`generateRuleInSingleTransaction` reserves/replays the operation, loads and revalidates workflow/snapshot, resolves options/configuration, invokes the in-process rule engine, inserts the report, CASes `CONFIRMED→ANALYSIS_GENERATED` with `current_report_id`, and completes the operation. A failure rolls back all partial business-entity and workflow writes.

Catch a deterministic rule/business failure inside the coordinator, persist the operation as `FAILED`, and commit no report/workflow transition. If an unexpected database failure marks the success transaction rollback-only, record the stable failed outcome in a separate short transaction after rollback. Same-key replay returns that failure without invoking the engine again.

Do not place `@Transactional` on a method called from the same bean; Spring proxying would not apply.

- [ ] **Step 3: Enforce completed-action semantics**

Same key/hash replays the same report and original 201. A new key after success returns 409 `ANALYSIS_ALREADY_GENERATED` with `currentReportId`; it never generates a second report.

- [ ] **Step 4: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=AnalysisControllerTest,AnalysisAuthorityControllerTest,AnalysisReportRepositoryTest" test
git add apps/server/src/main/java/org/footballlab/analysis apps/server/src/test/java/org/footballlab/analysis
git commit -m "feat: enforce authoritative rule analysis"
```

## Task 5: Make external analysis a two-short-transaction operation

**Files:**

- Create: `apps/server/src/main/java/org/footballlab/analysis/service/PreparedAnalysisOperation.java`
- Create: `apps/server/src/main/java/org/footballlab/analysis/service/AnalysisEngineInvocationException.java`
- Create: `apps/server/src/main/java/org/footballlab/workflow/service/WorkflowOperationRecoveryService.java`
- Modify: `apps/server/src/main/java/org/footballlab/llm/service/LlmInvocationAuditService.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/service/OpenAiCompatibleAnalysisEngine.java`
- Modify: `apps/server/src/main/java/org/footballlab/analysis/service/AnalysisTransactionCoordinator.java`
- Create: `apps/server/src/test/java/org/footballlab/analysis/AnalysisLlmTransactionTest.java`
- Create: `apps/server/src/test/java/org/footballlab/analysis/AnalysisOperationRecoveryTest.java`
- Modify: `apps/server/src/test/java/org/footballlab/llm/LlmInvocationAuditTest.java`

- [ ] **Step 1: Write RED concurrent-provider tests**

Use a blocking fake transport and latches. Two different keys on one workflow: only one claim succeeds; the other gets 409 `OPERATION_IN_PROGRESS` before transport, so invocation count remains one. Same-key replay after success returns the same report with no second transport/audit.

- [ ] **Step 2: Remove repository writes from the engine**

`OpenAiCompatibleAnalysisEngine` returns `AnalysisEngineResult` containing the validated report and a not-yet-persisted audit record, or throws a sanitized exception carrying a failure audit record. Add `buildSuccessRecord`/`buildFailureRecord` to `LlmInvocationAuditService`; retain existing immediate-save wrappers for the Review LLM path.

- [ ] **Step 3: Implement transaction A, network gap, and transaction B**

`claimExternalAnalysis` inserts operation, loads/freezes v2 input and resolved configuration, reserves IDs, and CAS claims `GENERATE_ANALYSIS` only when stage is `CONFIRMED` and active columns are null; then commits. `AnalysisServiceImpl` calls Provider outside every transaction. `completeExternalAnalysis` atomically inserts success audit/report, advances workflow, clears the matching claim, and succeeds the operation. `failExternalAnalysis` is only for a known Provider/validation failure: it atomically writes failure audit, clears only the matching claim, and marks FAILED while leaving workflow `CONFIRMED`.

If Provider returned but the completion transaction itself fails, the outcome is uncertain rather than a Provider failure. A separate best-effort short transaction CAS-marks only the matching operation `INTERRUPTED` and clears its claim; it writes no false failure audit and never invokes Provider again automatically. If that short transaction cannot reach the database, startup recovery performs the same stale-claim transition later.

- [ ] **Step 4: Recover stale claims without re-invocation**

At startup, operations still `IN_PROGRESS` for at least 15 minutes are CAS-marked `INTERRUPTED` and matching active claims are cleared. Use an injected `Clock` in tests. Do not call Provider. Same-key retry returns `OPERATION_INTERRUPTED`; a user can explicitly choose a new key after seeing the warning.

- [ ] **Step 5: Prove atomic visibility and failures**

Tests assert success audit/report/workflow/operation appear together; injected report/completion failure rolls all completion writes back, becomes stable `INTERRUPTED`, and does not re-invoke Provider; Provider failure has one failure audit, no report, stage `CONFIRMED`, cleared claim, stable same-key failure, and no secret/prompt/output in logs. Restart and provider-registry-default mutation tests must also prove that the explicit model/fixed prompt request hash does not drift.

- [ ] **Step 6: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=AnalysisLlmTransactionTest,AnalysisOperationRecoveryTest,AnalysisEngineTest,LlmInvocationAuditTest" test
git add apps/server/src/main/java/org/footballlab/analysis apps/server/src/main/java/org/footballlab/workflow/service/WorkflowOperationRecoveryService.java apps/server/src/main/java/org/footballlab/llm/service/LlmInvocationAuditService.java apps/server/src/test/java/org/footballlab/analysis apps/server/src/test/java/org/footballlab/llm/LlmInvocationAuditTest.java
git commit -m "feat: make LLM analysis idempotent and atomic"
```

## Task 6: Persist generated plans as immutable v2 content

**Files:**

- Rewrite: `apps/server/src/main/java/org/footballlab/plan/domain/StrategySimulationRequest.java`
- Modify: `apps/server/src/main/java/org/footballlab/plan/domain/SimulatedPlanSaveRequest.java`
- Create: `apps/server/src/main/java/org/footballlab/plan/persistence/SimulatedPlanPayloadV2.java`
- Create: `apps/server/src/main/java/org/footballlab/plan/persistence/SimulatedPlanV2Record.java`
- Create: `apps/server/src/main/java/org/footballlab/plan/persistence/LegacySimulatedPlanAdapter.java`
- Modify: `apps/server/src/main/java/org/footballlab/plan/repository/SimulatedPlanRepository.java`
- Rewrite: `apps/server/src/main/java/org/footballlab/plan/repository/JdbcSimulatedPlanRepository.java`
- Modify: `apps/server/src/test/java/org/footballlab/plan/SimulatedPlanRepositoryTest.java`
- Create: `apps/server/src/test/java/org/footballlab/plan/SimulatedPlanLineageRepositoryTest.java`

- [ ] **Step 1: Write RED repository immutability tests**

Test four-decimal odds, v2 generated/pending reads, legacy reads, projection/payload split fail-closed, one plan per report/workflow, unrelated authority refs, and saving a plan while asserting item row count, IDs, payloads, odds, stakes, and statuses remain byte/value identical.

- [ ] **Step 2: Replace upsert/delete-reinsert with explicit methods**

```java
void insertGeneratedPlan(SimulatedPlanV2Record plan);
boolean transitionToPendingResult(String planId, String operatorNote, String updatedAt);
Optional<SimulatedPlanV2Record> findV2ById(String planId);
Optional<SimulatedPlanV2Record> findV2ByReportId(String reportId);
Optional<SimulatedPlanResponse> findAnyById(String planId);
```

The transition SQL uses `WHERE plan_id=? AND plan_status='GENERATED'`; it updates only plan header status/note/time and compatible top-level projection. It never deletes, updates, or inserts `simulated_plan_item` rows.

- [ ] **Step 3: Keep legacy plan access isolated**

Legacy rows use the adapter and existing visible rules. A legacy handicap plan is readable and reviewable as `NEEDS_REVIEW`, but no v2 method treats it as authority.

- [ ] **Step 4: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=SimulatedPlanRepositoryTest,SimulatedPlanLineageRepositoryTest" test
git add apps/server/src/main/java/org/footballlab/plan apps/server/src/test/java/org/footballlab/plan
git commit -m "refactor: preserve immutable generated plan items"
```

## Task 7: Generate and save plans only from the persisted report

**Files:**

- Create: `apps/server/src/main/java/org/footballlab/plan/service/SimulatedPlanTransactionCoordinator.java`
- Modify: `apps/server/src/main/java/org/footballlab/plan/service/SimulatedPlanService.java`
- Rewrite: `apps/server/src/main/java/org/footballlab/plan/service/SimulatedPlanServiceImpl.java`
- Modify: `apps/server/src/main/java/org/footballlab/plan/controller/SimulatedPlanController.java`
- Rewrite: `apps/server/src/test/java/org/footballlab/plan/SimulatedPlanControllerTest.java`
- Create: `apps/server/src/test/java/org/footballlab/plan/SimulatedPlanAuthorityControllerTest.java`
- Create: `apps/server/src/test/java/org/footballlab/plan/SimulatedPlanIdempotencyTest.java`
- Modify: `apps/server/src/main/java/org/footballlab/review/service/ReviewWorkflowServiceImpl.java`
- Modify: `apps/server/src/test/java/org/footballlab/review/ReviewWorkflowControllerTest.java`

- [ ] **Step 1: Write RED strict-body/authority tests**

Simulation body is only `{"reportId":"analysis-550e8400-e29b-41d4-a716-446655440010"}`. Reject probability, risks, selections, strategy, snapshot, source, and unknown properties as `CLIENT_ASSERTED_REPORT_NOT_ALLOWED`. Reject missing/legacy/BLOCKED/ERROR/unsafe/unrelated report. Assert every generated item/amount/source field equals the persisted safe report.

- [ ] **Step 2: Implement a database-only transaction**

Reserve/replay operation, atomically claim current `ANALYSIS_GENERATED` workflow, load and cross-check report/snapshot/workflow, independently enforce WDL/selection, generate and insert plan/items, CAS to `PLAN_GENERATED` with `current_plan_id`, clear claim, and succeed operation. Same key replays 201; new key after success returns `PLAN_ALREADY_GENERATED` with currentPlanId.

- [ ] **Step 3: Implement save as a state transition**

`POST /api/simulated-plans` accepts only `generatedPlanId` plus the approved bounded operator note. It performs operation handling, verifies plan ownership/current stage, transitions header only, CASes workflow `PLAN_GENERATED→PENDING_RESULT`, and returns 200. New key after completion returns 409; same key replays the original 200.

- [ ] **Step 4: Restore generated plans by ID**

`GET /api/simulated-plans/{planId}` allows v2 `GENERATED` and `PENDING_RESULT`, validates it belongs to the workflow lineage, and returns full server items. Legacy detail keeps its existing visible behavior.

- [ ] **Step 5: Enforce the review boundary**

New v2 non-WDL data is a lineage-integrity failure and never settles. Legacy non-WDL remains read-only and follows existing `NEEDS_REVIEW/PLAY_TYPE_ERROR`; do not rewrite historical data.

- [ ] **Step 6: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=SimulatedPlanControllerTest,SimulatedPlanAuthorityControllerTest,SimulatedPlanIdempotencyTest,SimulatedPlanRepositoryTest,ReviewWorkflowControllerTest" test
git add apps/server/src/main/java/org/footballlab/plan apps/server/src/main/java/org/footballlab/review/service/ReviewWorkflowServiceImpl.java apps/server/src/test/java/org/footballlab/plan apps/server/src/test/java/org/footballlab/review/ReviewWorkflowControllerTest.java
git commit -m "feat: enforce authoritative plan lineage"
```

## Task 8: Minimize Web analysis and plan requests

**Files:**

- Rewrite: `apps/web/src/types/analysis.ts`
- Rewrite: `apps/web/src/api/analysis.ts`
- Modify: `apps/web/src/views/StrategySimulator.vue`
- Modify: `apps/web/src/views/StrategySimulator.spec.ts`
- Rewrite: `apps/web/src/types/simulatedPlan.ts`
- Rewrite: `apps/web/src/api/simulatedPlans.ts`
- Modify: `apps/web/src/views/SavedPlans.vue`
- Modify: `apps/web/src/views/SavedPlans.spec.ts`
- Modify: `apps/web/src/stores/analysisReport.ts`
- Modify: `apps/web/src/stores/simulatedPlan.ts`
- Modify: `apps/web/src/stores/ocrWorkflow.ts`

- [ ] **Step 1: Write RED payload tests**

Capture JSON and assert analysis contains only the six approved keys plus nested option allowlist, simulate contains only reportId, and save contains only generatedPlanId/operatorNote. Each write has a fresh UUID key persisted for unknown-response replay. Search emitted bodies for every removed authority property.

- [ ] **Step 2: Drive pages from workflow IDs/details**

After hydrate, Strategy Simulator loads the confirmed snapshot/report by current IDs, makes an explicit engine choice, and sends the minimal request. Plans load full generated detail by `currentPlanId`; they never reconstruct items from an in-memory report. Disable duplicate clicks only as UX—server idempotency remains authoritative.

- [ ] **Step 3: Handle stable recovery errors**

For `ANALYSIS_ALREADY_GENERATED`/`PLAN_ALREADY_GENERATED`, use returned current ID to rehydrate. For same-key FAILED/INTERRUPTED, show the stable warning and require an explicit user retry that creates a new key. Never silently invoke an external Provider.

- [ ] **Step 4: Run GREEN and the complete Phase 4 gate**

```powershell
npm.cmd run test -w apps/web -- src/views/StrategySimulator.spec.ts src/views/SavedPlans.spec.ts src/stores/ocrWorkflow.spec.ts
npm.cmd run lint:web
npm.cmd run build:web
mvn.cmd -f apps/server/pom.xml verify
npm.cmd run compliance:scan
git diff --check
```

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/types/analysis.ts apps/web/src/api/analysis.ts apps/web/src/views/StrategySimulator.vue apps/web/src/views/StrategySimulator.spec.ts apps/web/src/types/simulatedPlan.ts apps/web/src/api/simulatedPlans.ts apps/web/src/views/SavedPlans.vue apps/web/src/views/SavedPlans.spec.ts apps/web/src/stores
git commit -m "feat: use authoritative analysis and plan APIs"
```

## Phase 4 checkpoint

Run a v2 confirmed workflow through rule analysis, plan generation, refresh, and save. Then run focused concurrent tests with the fake external Provider. Expected: clients cannot inject matches/reports/items; generated plans restore before save; one workflow has at most one report and plan; one external operation produces at most one Provider call and one success audit; a failed or interrupted operation never auto-retries; legacy plans/reviews still open.
