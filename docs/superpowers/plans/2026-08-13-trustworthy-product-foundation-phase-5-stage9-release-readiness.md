# Trustworthy Product Foundation Phase 5: Stage 9 and Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove v0.2.0 end to end from real fictional image pixels through a saved plan, including same-origin OCR, backend-process restart recovery, authoritative lineage, legacy migration, privacy zero-findings, version consistency, documentation, and CI enforcement—without creating a tag or GitHub Release.

**Architecture:** Reusable Node helpers build and start only the current checkout, bind random loopback ports, use a test-owned temporary H2 file, expose build/run identity, and kill only recorded child PIDs. A production-dist server provides same-origin `/api` proxying and SPA fallback. Stage 9 runs a persistent Chromium profile for cold/warm OCR, restarts the exact backend JAR, captures sanitized evidence, and runs a separate database privacy audit after H2 closes.

**Tech Stack:** Node 20 test runner/http/child_process, Playwright Chromium, Spring Boot executable JAR, H2, Maven, YAML AST validation, GitHub Actions.

---

## Task 1: Isolate the historical Stage 8 smoke

**Files:**

- Create: `scripts/lib/isolated-runtime.mjs`
- Create: `scripts/lib/isolated-runtime.spec.mjs`
- Rewrite: `scripts/stage8-smoke.mjs`
- Modify: `apps/web/vite.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Write RED process-ownership tests**

Prove an already-listening unrelated port is never reused or killed, a child exiting before readiness fails immediately, cleanup targets only registered PID trees, ordinary error/signal both run `finally`, and Windows paths/arguments with spaces are passed using `shell:false` and argument arrays.

- [ ] **Step 2: Run RED**

```powershell
node --test scripts/lib/isolated-runtime.spec.mjs
```

- [ ] **Step 3: Implement owned-process primitives**

Export typed helpers for command selection (`npm.cmd`/`mvn.cmd`/`java.exe` on Windows), temporary roots, child spawn, line-buffered readiness, graceful then bounded forced termination, and limited cleanup retry. Store only sanitized stdout/stderr tails; never store request bodies.

- [ ] **Step 4: Remove fixed-port reuse and port-based killing**

Stage 8 must always start this run's services, inject a temporary file H2 URL, parse the Spring `server.port=0` result, start Vite on its own dynamic port with `LOCAL_API_TARGET`, use the v2 API bodies, and clean only its PIDs. `vite.config.ts` defaults to 8080 for normal development but reads the controlled target for tests.

- [ ] **Step 5: Run GREEN and prove no residue**

```powershell
node --test scripts/lib/isolated-runtime.spec.mjs
npm.cmd run smoke:stage8
git status --short
```

Expected: smoke exits `0`; no test H2/process remains; daily `apps/server/data` is unchanged; no unknown 8080/5173 process is touched.

- [ ] **Step 6: Commit**

```powershell
git add scripts/lib/isolated-runtime.mjs scripts/lib/isolated-runtime.spec.mjs scripts/stage8-smoke.mjs apps/web/vite.config.ts package.json
git commit -m "test: isolate Stage 8 smoke runtime"
```

## Task 2: Expose current build identity and serve the production SPA

**Files:**

- Create: `apps/server/src/main/java/org/footballlab/system/domain/BuildInfoResponse.java`
- Create: `apps/server/src/main/java/org/footballlab/system/controller/SystemInfoController.java`
- Create: `apps/server/src/test/java/org/footballlab/system/SystemInfoControllerTest.java`
- Modify: `apps/server/pom.xml`
- Create: `scripts/stage9-web-server.mjs`
- Create: `scripts/stage9-web-server.spec.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write RED build-info tests**

`GET /api/system/build-info` must return artifact, Maven version, and nullable `verificationRunId` from `app.verification.run-id`. Test an injected UUID and absence in ordinary local startup; never return environment variables or Git workspace paths.

- [ ] **Step 2: Enable Maven build-info and implement the endpoint**

Use Spring Boot Maven plugin `build-info`. The response body remains inside the existing `Result` success envelope.

- [ ] **Step 3: Write RED static-server tests**

With a temporary fake `dist`, assert loopback dynamic binding, exact files, 404 for missing static extensions, `index.html` fallback for `/workflows/workflow-550e8400-e29b-41d4-a716-446655440000/plans`, same-origin `/api/**` proxy only to the injected loopback backend, no body logging, and `GET /__stage9/build-info` returning run ID, Web version, and `dist/index.html` SHA-256.

- [ ] **Step 4: Implement the Node production server**

Use Node core HTTP modules. Prevent path traversal, enforce an allowlisted proxy target created by the runner, stream bodies without recording them, and expose the chosen port to the parent through a machine-readable readiness line.

- [ ] **Step 5: Run GREEN and commit**

```powershell
mvn.cmd -f apps/server/pom.xml "-Dtest=SystemInfoControllerTest" test
node --test scripts/stage9-web-server.spec.mjs
npm.cmd run build:web
git add apps/server/pom.xml apps/server/src/main/java/org/footballlab/system apps/server/src/test/java/org/footballlab/system scripts/stage9-web-server.mjs scripts/stage9-web-server.spec.mjs package.json
git commit -m "feat: expose verifiable local build identity"
```

## Task 3: Unit-test the Stage 9 runner and privacy scanner

**Files:**

- Create: `scripts/stage9-smoke.mjs`
- Create: `scripts/stage9-smoke.spec.mjs`
- Create: `scripts/stage9-privacy-audit.mjs`
- Create: `scripts/stage9-privacy-audit.spec.mjs`
- Create: `apps/server/src/test/java/org/footballlab/persistence/Stage9PrivacyDatabaseAuditTest.java`
- Modify: `package.json`

- [ ] **Step 1: Write RED runner state-machine tests**

Inject fake build/process/browser adapters and cover build failure, JAR ambiguity (including `.original` exclusion), child exit before ready, wrong build version/run ID, backend restart with the same DB, H2 lock wait, external request, browser failure, audit failure, and cleanup after each stage. Assert the runner never probes/reuses an existing service.

- [ ] **Step 2: Write RED privacy-transform tests**

Scan raw, URL-encoded, JSON-escaped, and UTF-8 Base64 forms of the per-run sentinel/original filename plus `data:image`, PNG/JPEG/WebP Base64 prefixes, `rawText`, and multipart image fields. Failures report only category, method/path, and content SHA-256—never the matching text.

- [ ] **Step 3: Implement the fixed runner sequence**

The runner must:

1. create `os.tmpdir()/football-lab-stage9-*`;
2. generate a run ID and original-file-name sentinel, and read the fixed raw-only sentinel from `assets/ocr-samples/fictional-golden.json`;
3. remove all known LLM API key variables from child environments;
4. run `npm.cmd run build:web` and `mvn.cmd -f apps/server/pom.xml package -DskipTests` before starting services;
5. select the one current executable JAR, excluding `.original`;
6. start it on `127.0.0.1`, `server.port=0`, a temporary file H2, disabled H2 console, and injected run ID;
7. start the production Web server against current `dist`;
8. verify backend and Web build identities;
9. launch a temporary persistent Chromium profile;
10. execute the golden flow;
11. stop/restart the same JAR against the same H2 and restore the same workflow;
12. audit browser/network/log/database evidence;
13. close and delete only owned resources in `finally`.

- [ ] **Step 4: Implement database audit opt-in only**

`Stage9PrivacyDatabaseAuditTest` skips unless `stage9.db.url` is explicitly supplied. With the server stopped, it uses DriverManager to enumerate relevant character/CLOB columns and assert zero sentinel/file-name/encoding findings, `ocr_task.raw_text IS NULL`, and coverage of operation, audit, snapshot, report, plan, item, and all payload columns. It prints table/column names and counts only.

- [ ] **Step 5: Run GREEN and commit the harness before the long smoke**

```powershell
node --test scripts/stage9-smoke.spec.mjs scripts/stage9-privacy-audit.spec.mjs
mvn.cmd -f apps/server/pom.xml "-Dtest=Stage9PrivacyDatabaseAuditTest" test
```

Expected: Java test reports skipped without its explicit DB URL; Node tests pass.

```powershell
git add scripts/stage9-smoke.mjs scripts/stage9-smoke.spec.mjs scripts/stage9-privacy-audit.mjs scripts/stage9-privacy-audit.spec.mjs apps/server/src/test/java/org/footballlab/persistence/Stage9PrivacyDatabaseAuditTest.java package.json
git commit -m "test: add isolated Stage 9 harness"
```

## Task 4: Implement the real Stage 9 golden workflow

**Files:**

- Modify: `scripts/stage9-smoke.mjs`
- Modify: `scripts/stage9-smoke.spec.mjs`
- Modify: `apps/web/src/views/ScreenshotUpload.vue` only if a test-safe accessibility selector is missing
- Modify: `apps/web/src/views/OcrReviewWizard.vue` only if a test-safe accessibility selector is missing

- [ ] **Step 1: Add browser network containment**

Record URL/query/header/body metadata for every write request in memory; abort and fail every HTTP(S) origin other than the current Stage 9 Web origin. Allow browser-internal `blob:` only when required by the reviewed worker configuration; no remote URL is allowed. Keep trace/video/screenshot off.

- [ ] **Step 2: Run the cold-cache real OCR flow**

Upload `apps/web/public/ocr-samples/fictional-golden.png` under a unique local filename, select the approved source declaration, preview/rotate/crop/add a redaction away from stable tokens, and run real Tesseract. Assert stable English/Chinese tokens and structured mapping, not full raw text or exact confidence. Record server request counts for worker/core/`eng`/`chi_sim` assets.

- [ ] **Step 3: Edit, save, refresh, and restart**

Create at least two matches, each with exactly one WDL selection/odds; save the draft; refresh and assert revision/order. Stop the backend, wait for process exit/port close/H2 unlock, restart the same JAR with the same run ID/database, then open the same explicit workflow URL and assert recovery.

- [ ] **Step 4: Complete the authoritative chain**

Confirm, generate `MOCK_RULE_ENGINE` analysis, generate plan, save plan, and directly `page.goto` the plan deep link. Add negative API calls for client-asserted analysis/report fields, missing/legacy parents, same-key/different-payload, duplicate different-key transition, and two selections for one match.

- [ ] **Step 5: Prove warm cache and cancellation**

Close Chromium, relaunch with the same temporary persistent profile, and repeat OCR; static-server request counts for `eng`/`chi_sim` must not increase. Separately delay initialization and recognition, cancel/change route/unmount, assert termination/no stale parse, retry once, and prove active workers do not grow. In a controlled same-session case, initialize the Worker and finish one recognition, then make the adapter's injected IndexedDB capability probe unavailable without terminating that Worker. A second recognition must use the already loaded model, complete with a cache warning, and make zero external requests.

- [ ] **Step 6: Audit all storage and evidence before cleanup**

Allow only versioned public Tesseract cache entries in IndexedDB; require Cache Storage and LocalStorage to contain no user-derived data; SessionStorage may contain only workflow ID and short-lived non-sensitive pending-create metadata. Scan production `dist`, browser console, network capture, server stdout/stderr/logs, H2 audit result, and every generated temporary attachment. Raw-only sentinel and original filename must have zero matches. The source-only fixture metadata file is the one explicit scanner input exception; it must never be copied into `dist` or a runtime attachment.

Assert the production application has no Service Worker registration and does not claim offline-PWA support. The run may use browser HTTP cache and the approved Tesseract IndexedDB cache only.

- [ ] **Step 7: Run the real smoke**

```powershell
npm.cmd run smoke:stage9
```

Expected: current build/run identities match; real OCR, backend restart, deep link, rule analysis, generated/saved plan, warm cache, cancellation, privacy scan, and cleanup all pass. If it fails, no sensitive body is printed and no temporary process/database/profile remains.

- [ ] **Step 8: Commit**

```powershell
git add scripts/stage9-smoke.mjs scripts/stage9-smoke.spec.mjs apps/web/src/views/ScreenshotUpload.vue apps/web/src/views/OcrReviewWizard.vue
git commit -m "test: add private Stage 9 golden flow"
```

## Task 5: Lock the Stage 9 command and CI structure

**Files:**

- Create: `scripts/stage9-config.spec.mjs`
- Modify: `scripts/stage8-config.spec.mjs`
- Modify: `scripts/compliance-scan.js`
- Create: `scripts/compliance-scan.spec.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/compliance.yml`

- [ ] **Step 1: Write compliance-boundary RED tests**

Refactor the compliance scanner to export a pure `scanRepository(root)` while preserving direct CLI behavior. Temporary-repository tests must prove it rejects an unmanifested OCR binary, remote OCR/CDN URL in runtime source or the runtime manifest, source-image data URI/Base64/multipart fields, and `rawText`/original `fileName` in v2 write DTO/API code. It must accept the single manifest-listed fictional PNG and harmless negative-test/documentation strings. Enumerate tracked plus non-ignored worktree files so a new untracked violation cannot evade a local pre-commit run; keep generated ignored Tesseract assets under the independent manifest checker.

This remains a deterministic policy scanner, not a legal or security clearance. Error output names only policy/category/file, never captured user content.

- [ ] **Step 2: Write config RED tests**

Parse JSON and workflow YAML with `yaml.parseDocument`. Assert no parse errors/warnings, plain scalar run commands, mapping steps with exactly one of `run/uses`, and full ordered six-step CI semantics. Add in-memory negative mutations for block/folded run, unknown tag, null/scalar/name-only step, run+uses, unknown key, extra/reordered/renamed step, chained command, and direct community/OCR command duplication.

- [ ] **Step 3: Define scripts once in dependency order**

Add:

```json
{
  "test:ocr-core": "npm run test -w packages/ocr-core",
  "test:ocr-fixtures": "node --test scripts/fictional-ocr-sample.spec.mjs",
  "sync:ocr-assets": "node scripts/sync-ocr-assets.mjs",
  "check:ocr-assets": "node scripts/ocr-assets-check.mjs",
  "test:ocr-assets": "node --test scripts/ocr-assets-check.spec.mjs",
  "test:compliance-scan": "node --test scripts/compliance-scan.spec.mjs",
  "test:isolated-runtime": "node --test scripts/lib/isolated-runtime.spec.mjs",
  "test:stage9-web-server": "node --test scripts/stage9-web-server.spec.mjs",
  "test:stage9-smoke": "node --test scripts/stage9-smoke.spec.mjs scripts/stage9-privacy-audit.spec.mjs",
  "test:stage9-config": "node scripts/stage9-config.spec.mjs",
  "smoke:stage9": "node scripts/stage9-smoke.mjs"
}
```

Set `verify:stage9` to one ordered chain: community templates; compliance-scanner tests and scan; OCR Core; fictional-fixture test; sync/check/asset tests; runtime/Web-server/Stage9 unit tests; Web typecheck/tests/build; Maven verify; Stage 8 config; Stage 9 config; isolated Stage 8 smoke; real Stage 9 smoke. Keep `verify:stage8` unchanged as the historical entry and keep `smoke:deepseek` outside every CI chain.

- [ ] **Step 4: Split config ownership cleanly**

Stage 8 config keeps the historic script contract but no longer decides the current CI terminal command. Stage 9 config owns exact current CI and version/doc assertions.

- [ ] **Step 5: Update CI to the exact six steps**

```yaml
- Checkout
- Setup Node.js 20
- Setup Java 17
- Install dependencies
- Install Playwright Chromium
- Run Stage 9 verification
```

The last command is plain `npm run verify:stage9`; add a finite job timeout that fails rather than masking timeout. No secrets or external LLM smoke are included.

- [ ] **Step 6: Run GREEN and commit**

```powershell
npm.cmd run test:stage8-config
npm.cmd run test:stage9-config
npm.cmd run test:compliance-scan
npm.cmd run compliance:scan
git diff --check
git add scripts/stage9-config.spec.mjs scripts/stage8-config.spec.mjs scripts/compliance-scan.js scripts/compliance-scan.spec.mjs package.json package-lock.json .github/workflows/compliance.yml
git commit -m "ci: promote Stage 9 verification gate"
```

## Task 6: Align every release-candidate version

**Files:**

- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/ocr-core/package.json`
- Modify: `apps/server/pom.xml`
- Modify: `package-lock.json`
- Modify: `scripts/stage9-config.spec.mjs`

- [ ] **Step 1: Add a version-consistency RED assertion**

Require root, Web, OCR Core, lockfile root/workspaces, server project, built JAR manifest/build-info, and Stage 9 endpoints all equal `0.2.0` with no `SNAPSHOT`.

- [ ] **Step 2: Update source package versions and regenerate the lock only**

```powershell
npm.cmd install --package-lock-only --ignore-scripts
```

Do not hand-edit lockfile workspace metadata.

- [ ] **Step 3: Run GREEN and commit**

```powershell
npm.cmd run test:stage9-config
mvn.cmd -f apps/server/pom.xml "-Dtest=SystemInfoControllerTest" test
git add package.json apps/web/package.json packages/ocr-core/package.json apps/server/pom.xml package-lock.json scripts/stage9-config.spec.mjs
git commit -m "chore: align v0.2.0 versions"
```

## Task 7: Update public documentation and release-candidate evidence

**Files:**

- Modify: `README.md`
- Modify: `apps/server/README.md`
- Modify: `docs/privacy.md`
- Modify: `docs/compliance.md`
- Rewrite: `docs/screenshot-ocr.md`
- Modify: `docs/product-architecture.md`
- Modify: `docs/database.md`
- Modify: `docs/oss-maintenance.md`
- Modify: `NOTICE`
- Create: `CHANGELOG.md`
- Create: `docs/releases/v0.2.0.md`
- Modify locally but do not stage: `handoff.md`

- [ ] **Step 1: Write a documentation contract RED test**

Extend Stage 9 config to require v0.2.0, `verify:stage9`, real local OCR, original-image/raw-text boundary, editable draft, explicit workflow recovery, authority lineage, legacy compatibility, internal API breaking change, third-party license link, and “not a release/adoption claim” text. Forbid stale claims such as browser Mock OCR, in-memory-only workflow, or Stage 8 as the current release gate.

- [ ] **Step 2: Update user and operator documentation**

README describes only implemented v0.2 behavior and keeps simulation/non-official/no-profit language. Server README documents exact endpoints, idempotency/revision, 410 tombstone, status/error codes. Privacy explains browser memory, public model IndexedDB, no user-derived persistent cache, pre-confirm abandon deletion, and post-confirm audit retention.

- [ ] **Step 3: Update architecture/database/OCR/compliance docs**

Document V3 tables/CAS/authority columns/legacy nulls, local asset paths/versions/input limits/worker lifecycle, WDL-only boundary, same-origin network, process-restart recovery, and Stage 9 temporary database isolation.

- [ ] **Step 4: Add truthful release-candidate notes**

`CHANGELOG.md` and `docs/releases/v0.2.0.md` list capabilities, internal API break, migration, verification commands, known local-single-user/Chromium limits, Codex assistance with human maintainer responsibility, and the fact that preparation does not mean a tag or GitHub Release exists. Do not change a public evidence ledger to claim v0.2.0 is released or adopted.

- [ ] **Step 5: Run docs/compliance GREEN and commit**

```powershell
npm.cmd run test:stage9-config
npm.cmd run compliance:scan
git diff --check
git add README.md apps/server/README.md docs/privacy.md docs/compliance.md docs/screenshot-ocr.md docs/product-architecture.md docs/database.md docs/oss-maintenance.md docs/releases/v0.2.0.md NOTICE CHANGELOG.md
git commit -m "docs: prepare the v0.2.0 trustworthy workflow"
```

Update ignored `handoff.md` with fresh local evidence after final verification, but do not force-add it.

## Task 8: Run the release-readiness gate and inspect the repository

**Files:** none unless a failing test reveals a scoped defect; fix defects in the owning task and rerun from its RED/GREEN step.

- [ ] **Step 1: Run the complete current-checkout gate**

```powershell
npm.cmd ci
npm.cmd run verify:stage9
npm.cmd run compliance:scan
git diff --check origin/main...HEAD
```

- [ ] **Step 2: Audit dependencies without auto-fixing**

```powershell
npm.cmd audit --json
npm.cmd audit --omit=dev --json
```

Record results; do not run `npm audit fix --force` or broaden versions during the release audit.

- [ ] **Step 3: Verify no runtime/user artifacts are tracked**

```powershell
git ls-files | Select-String -Pattern '(^|/)(output|logs|target|dist|test-results|playwright-report)/|\.mv\.db$|\.trace\.db$'
git status --short --branch
```

Expected: no generated OCR runtime directory, build output, H2, logs, user images, raw OCR, Playwright private attachments, or secrets are tracked; worktree is clean after committing any scoped fixes.

- [ ] **Step 4: Record exact evidence**

Capture commit SHA, test counts, current build version/run identity, OCR manifest file count/checksums, real stable-token evidence, cold/warm language request counts, workflow/backend restart IDs, legacy migration result, privacy scan categories/count zero, command exit codes, and known limitations. Do not include raw OCR or sensitive bodies.

- [ ] **Step 5: Stop at the external-action gate**

Do not tag, push, open/ready/merge a PR, create a GitHub Release, or delete a branch. Present the clean verified commit and evidence for explicit user approval of the next external action.
