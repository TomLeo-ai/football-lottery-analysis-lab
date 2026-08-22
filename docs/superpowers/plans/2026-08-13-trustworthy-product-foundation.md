# Trustworthy Product Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver v0.2.0 as a locally operated, privacy-preserving workflow that performs real browser OCR, lets users correct structured match data, persists and restores the workflow, and prevents clients from forging the snapshot-to-report-to-plan lineage.

**Architecture:** Build the release in five dependency-ordered phases. The browser owns image pixels and raw OCR; Spring Boot owns the durable workflow state machine and confirmed data; analysis and plan services reconstruct inputs from authoritative database records; Stage 9 proves the whole chain against the current checkout on isolated ports and a temporary H2 database.

**Tech Stack:** TypeScript workspace package, Tesseract.js 7, Vue 3.5, Pinia, Vue Router, Vitest, Spring Boot 3.3.6, Java 17, Spring JDBC, Flyway, H2, Node test, Playwright Chromium, GitHub Actions.

---

## Source of truth

Implement against the approved design, not against this index alone:

- `docs/superpowers/specs/2026-08-13-trustworthy-product-foundation-design.md`

The five detailed plans below are normative implementation checklists. If a plan appears to conflict with the approved design, stop that task and reconcile the plan with the design before changing product code.

## Execution order and checkpoints

| Order | Detailed plan | User-visible checkpoint | Required gate before continuing |
|---|---|---|---|
| 1 | `2026-08-13-trustworthy-product-foundation-phase-1-ocr-core-assets.md` | A rights-safe golden image and deterministic OCR-domain mapping exist; all OCR runtime assets are same-origin and integrity-checked. | OCR Core tests, asset manifest check, license check, compliance scan |
| 2 | `2026-08-13-trustworthy-product-foundation-phase-2-browser-ocr.md` | The upload page reads actual pixels, previews/transforms them, runs Tesseract in a worker, supports cancel/retry/manual fallback, and hands minimized evidence to a local editable two-match draft without uploading image/raw text. | Vitest, production build, focused Playwright real-OCR smoke |
| 3 | `2026-08-13-trustworthy-product-foundation-phase-3-workflow-review.md` | Users can edit two or more matches, save a revisioned draft, refresh/restart, confirm an immutable snapshot, and reopen the exact workflow URL. | Flyway upgrade tests, Spring workflow tests, Vue tests, workflow recovery smoke |
| 4 | `2026-08-13-trustworthy-product-foundation-phase-4-authoritative-analysis-plan.md` | Analysis loads only a confirmed v2 snapshot; plan generation loads only a persisted safe report; retries and concurrency cannot duplicate an LLM call, report, or plan. | Spring lineage/idempotency tests, LLM audit transaction tests, Vue analysis/plan tests |
| 5 | `2026-08-13-trustworthy-product-foundation-phase-5-stage9-release-readiness.md` | One isolated command proves real OCR through saved plan, privacy invariants, process restart recovery, legacy compatibility, versions, docs, and CI wiring. | `npm.cmd run verify:stage9`, compliance scan, `git diff --check` |

Do not begin a later phase while the preceding checkpoint is red. A checkpoint commit must contain its focused tests and implementation together; never commit a knowingly failing mainline state.

## Global invariants

- [ ] Keep user-supplied image bytes, original file names, EXIF, raw OCR text, word arrays, Canvas pixels, Blob/Object URLs, Data URLs, and Base64 out of every API body, database payload, log, audit row, browser persistent user-data cache, and generated test artifact. The only tracked image is the project-generated, manifest-listed fictional golden fixture; its raw-only sentinel metadata stays outside production `dist`.
- [ ] Permit network traffic during OCR only to same-origin versioned OCR assets and relative `/api` endpoints. There is no CDN fallback and no remote OCR fallback.
- [ ] Treat each v0.2 `market` as one selected `WIN_DRAW_LOSS` direction plus its decimal odds. Each match has exactly one market; selections are only `HOME_WIN`, `DRAW`, or `AWAY_WIN`.
- [ ] Generate formal match, market, snapshot, report, plan, and item IDs on the server. Browser draft UUIDs are not authority IDs.
- [ ] Require a UUID `Idempotency-Key` for every v0.2 write endpoint. Same key plus same canonical request replays the original status/resource; same key plus a different canonical request is `409 IDEMPOTENCY_KEY_REUSED`.
- [ ] Advance workflow state and write the related entity in one short transaction using compare-and-set conditions on stage/version. Never hold a database transaction open across an external LLM request.
- [ ] Reject unknown JSON properties at every new/changed write boundary. Do not silently ignore client-asserted authority fields.
- [ ] Keep V1 and V2 Flyway migrations byte-for-byte unchanged. Migrate real legacy fixtures without deleting or rewriting old payloads.
- [ ] Keep legacy non-WDL plans readable and route their review through the existing `NEEDS_REVIEW` behavior; never upgrade or reinterpret them as v2 authority.
- [ ] Preserve `code/msg/data` on successful API responses. New error details are optional and serialized only for failures.
- [ ] Do not create a GitHub Release, push a branch, open/ready/merge a PR, or claim external adoption as part of these implementation plans. Those are separate explicit approval gates.

## Shared naming contract

Use these names consistently across phases so that backend and frontend types do not drift:

```text
WorkflowStage:
  WAITING_LOCAL_OCR
  WAITING_USER_CONFIRMATION
  CONFIRMED
  ANALYSIS_GENERATED
  PLAN_GENERATED
  PENDING_RESULT
  ABANDONED

OcrEntryMode:
  OCR_CANDIDATES
  MANUAL_BLANK

AuthorityVersion:
  SERVER_CONFIRMED_V2
  LEGACY_V1

EngineMode:
  MOCK_RULE_ENGINE
  OPENAI_COMPATIBLE

PlayType:
  WIN_DRAW_LOSS

Selection:
  HOME_WIN
  DRAW
  AWAY_WIN
```

Canonical endpoint set:

```text
POST   /api/screenshots/tasks
POST   /api/ocr/parse-local-result
GET    /api/ocr/workflows/{workflowId}
DELETE /api/ocr/workflows/{workflowId}
GET    /api/ocr/tasks/{ocrTaskId}
PUT    /api/ocr/review-drafts/{ocrTaskId}
POST   /api/ocr/review-drafts/{ocrTaskId}/confirm
POST   /api/ocr/review/confirm                         # fixed 410 tombstone
GET    /api/ocr/snapshots/{snapshotId}
POST   /api/analysis/generate
GET    /api/analysis/reports/{reportId}
POST   /api/strategies/simulate
POST   /api/simulated-plans
GET    /api/simulated-plans/{planId}
```

## Commit discipline

Every detailed-plan task ends with its exact focused test command, staging scope, and commit subject. Those task-local commit blocks are the authoritative sequence; execute them in phase/task order and do not replace them with a single large phase commit. If an implementation discovery changes a task boundary, update the approved plan first so tests, implementation, and documentation still land together in one reviewable unit.

Before each commit:

```powershell
git diff --check
git status --short
```

Before the final implementation handoff:

```powershell
npm.cmd run verify:stage9
npm.cmd run compliance:scan
git diff --check origin/main...HEAD
git status --short --branch
```

Expected result: all commands exit `0`; `verify:stage9` reports the current build identity, same-origin OCR asset integrity, real OCR golden workflow, process-restart recovery, legacy migration coverage, and zero privacy-sentinel findings; the worktree is clean.

## Stop conditions

Stop the active task and fix the failing invariant before continuing when any of the following occurs:

- a real OCR test reaches an external origin;
- Tesseract silently downloads a default worker/core/language asset;
- a write request contains the original file name, raw OCR text, image bytes, Data URL, or Base64 signature;
- a V3 migration fails on the checked-in v0.1 fixture;
- the same idempotency key creates a second resource or triggers a second Provider call;
- a different key bypasses an already completed workflow transition;
- a generated report or plan can be created with a missing/legacy/unrelated parent;
- a deep link silently falls back to another workflow in session storage;
- Stage 9 reuses an unknown process on ports 8080/5173 or touches the developer database.
