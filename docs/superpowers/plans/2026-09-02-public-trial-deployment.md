# Public Trial Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the current Stage 9 application as a disposable Render Free public trial with prominent data-reset warnings and a GitHub feedback path.

**Architecture:** A multi-stage Docker build creates the Vue/OCR bundle, copies it into Spring Boot static resources, and packages one executable JAR. A `trial` Spring profile binds the single container to Render's public port, disables the H2 console, and stores disposable H2 data under `/tmp`; a bounded controller forwards only known Vue routes to `index.html`.

**Tech Stack:** Vue 3, TypeScript, Vitest, Spring Boot 3.3, Java 17, H2, Docker multi-stage builds, Render Blueprint YAML.

---

## File map

- Create `apps/web/src/components/TrialDataNotice.vue`: reusable full and compact trial warning with compliance and GitHub Issues links.
- Modify `apps/web/src/App.vue`: render the non-dismissible warning above both the marketing home and application shell.
- Modify `apps/web/src/App.spec.ts`: direct assertion for warning text and feedback URL.
- Modify `apps/web/src/views/ScreenshotUpload.vue`: repeat the compact warning before upload controls.
- Modify `apps/web/src/views/OcrReviewWizard.vue`: repeat the compact warning before draft editing/saving.
- Modify `apps/web/src/assets/main.css`: responsive full/compact warning presentation.
- Create `apps/server/src/main/resources/application-trial.yml`: Render port/bind, disposable H2 location, disabled H2 console.
- Create `apps/server/src/main/java/org/footballlab/system/controller/SpaForwardController.java`: forward only approved Vue deep links.
- Create `apps/server/src/test/java/org/footballlab/system/SpaForwardControllerTest.java`: direct route and API exclusion contract.
- Create `Dockerfile`: Web/OCR build, Spring packaging, minimal Java runtime.
- Create `.dockerignore`: exclude local dependencies, build output, databases, logs, Git metadata, and local handoff.
- Create `render.yaml`: one free Docker web service, CI-gated automatic deploy, build-info health check.
- Modify `README.md`: public-trial behavior, cold start, data reset, feedback, and deployment instructions.

### Task 1: Add the user-visible disposable-data warning

**Files:**
- Create: `apps/web/src/components/TrialDataNotice.vue`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/App.spec.ts`
- Modify: `apps/web/src/views/ScreenshotUpload.vue`
- Modify: `apps/web/src/views/OcrReviewWizard.vue`
- Modify: `apps/web/src/assets/main.css`

- [ ] **Step 1: Write the focused failing App assertion**

Add to the `/dashboard` App test:

```ts
const notice = wrapper.get('[data-testid="public-trial-notice"]');
expect(notice.text()).toContain('休眠、重启或升级后');
expect(notice.text()).toContain('草稿、方案及复盘数据可能被清空');
expect(notice.text()).toContain('请勿上传敏感信息或无权使用的图片');
expect(notice.get('a[href="https://github.com/TomLeo-ai/football-lottery-analysis-lab/issues"]'))
  .toBeTruthy();
```

- [ ] **Step 2: Run the single failing Web test**

Run: `npm.cmd run test -w apps/web -- src/App.spec.ts`

Expected: FAIL because `public-trial-notice` does not exist.

- [ ] **Step 3: Implement the reusable warning and placements**

Create `TrialDataNotice.vue` with `compact?: boolean`, `role="note"`, the full approved warning, a `RouterLink` to `/about-compliance`, and an external link to:

```text
https://github.com/TomLeo-ai/football-lottery-analysis-lab/issues
```

Render the full component as the first element of `App.vue`. Render the compact component after the page heading in both `ScreenshotUpload.vue` and `OcrReviewWizard.vue`. The compact text must say:

```text
试用数据可能在服务休眠、重启、重新部署或升级后清空，请勿保存重要信息。
```

Add bounded responsive styles under `.trial-notice` and `.trial-notice--compact`; the notice has no close button and remains in normal document flow on mobile and desktop.

- [ ] **Step 4: Run only the direct Web test**

Run: `npm.cmd run test -w apps/web -- src/App.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the warning**

```powershell
git add apps/web/src/components/TrialDataNotice.vue apps/web/src/App.vue apps/web/src/App.spec.ts apps/web/src/views/ScreenshotUpload.vue apps/web/src/views/OcrReviewWizard.vue apps/web/src/assets/main.css
git commit -m "feat: warn public trial users about data resets"
```

### Task 2: Package Web and API as one public service

**Files:**
- Create: `apps/server/src/main/java/org/footballlab/system/controller/SpaForwardController.java`
- Create: `apps/server/src/test/java/org/footballlab/system/SpaForwardControllerTest.java`
- Create: `apps/server/src/main/resources/application-trial.yml`

- [ ] **Step 1: Write the focused SPA route test**

The standalone MockMvc test must assert:

```java
mockMvc.perform(get("/dashboard"))
        .andExpect(status().isOk())
        .andExpect(view().name("forward:/index.html"));
mockMvc.perform(get("/workflows/workflow-001/plans/plan-001"))
        .andExpect(status().isOk())
        .andExpect(view().name("forward:/index.html"));
mockMvc.perform(get("/api/not-a-spa-route"))
        .andExpect(status().isNotFound());
```

- [ ] **Step 2: Run the single failing server test**

Run: `mvn.cmd -f apps/server/pom.xml "-Dtest=SpaForwardControllerTest" test`

Expected: FAIL because `SpaForwardController` does not exist.

- [ ] **Step 3: Add the bounded forwarder and trial profile**

`SpaForwardController` uses `@Controller` and `@GetMapping` for exactly the router's non-root top-level paths plus:

```text
/workflows/{workflowId}
/workflows/{workflowId}/ocr
/workflows/{workflowId}/ocr-review
/workflows/{workflowId}/match-workspace
/workflows/{workflowId}/analysis
/workflows/{workflowId}/plans
/workflows/{workflowId}/plans/{planId}
```

Every mapping returns `forward:/index.html`; it must not use a catch-all mapping.

`application-trial.yml` sets:

```yaml
spring:
  datasource:
    url: jdbc:h2:file:${TRIAL_DATA_DIR:/tmp/football-lottery-analysis-lab}/trial;MODE=MySQL;DATABASE_TO_LOWER=TRUE
  h2:
    console:
      enabled: false
server:
  address: 0.0.0.0
  port: ${PORT:8080}
```

- [ ] **Step 4: Run only the direct server test**

Run: `mvn.cmd -f apps/server/pom.xml "-Dtest=SpaForwardControllerTest" test`

Expected: PASS with three assertions and `BUILD SUCCESS`.

- [ ] **Step 5: Commit the runtime**

```powershell
git add apps/server/src/main/java/org/footballlab/system/controller/SpaForwardController.java apps/server/src/test/java/org/footballlab/system/SpaForwardControllerTest.java apps/server/src/main/resources/application-trial.yml
git commit -m "feat: serve the trial as one Spring application"
```

### Task 3: Add Docker and Render deployment configuration

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `render.yaml`

- [ ] **Step 1: Add the multi-stage Docker build**

The Dockerfile must:

1. use Node 20 to run `npm ci` and `npm run build:web` (which synchronizes approved OCR assets);
2. use Maven with Java 17 to copy `apps/web/dist` into `apps/server/src/main/resources/static` and run `mvn -f apps/server/pom.xml -DskipTests package`;
3. copy only the executable JAR into a Java 17 JRE image;
4. expose 8080 and run the JAR with `--spring.profiles.active=trial`;
5. run as a non-root user and set `TRIAL_DATA_DIR=/tmp/football-lottery-analysis-lab`.

- [ ] **Step 2: Add the Render Blueprint**

Create `render.yaml`:

```yaml
services:
  - type: web
    name: football-lottery-analysis-lab
    runtime: docker
    plan: free
    region: singapore
    dockerfilePath: ./Dockerfile
    dockerContext: .
    healthCheckPath: /api/system/build-info
    autoDeployTrigger: checksPass
```

No database, disk, LLM key, or hidden environment secret is declared.

- [ ] **Step 3: Add the Docker build context exclusions**

`.dockerignore` must exclude `.git`, `.github`, every `node_modules`, every `target`/`dist`, local H2 files, logs, test results, `output`, `handoff.md`, `.env*` except no exception is needed because deployment has no secrets.

- [ ] **Step 4: Perform the one container check**

Start Docker Desktop only if its engine is not running. Then run:

```powershell
docker build -t football-lottery-analysis-lab:trial .
docker run --rm -d --name football-lottery-trial-check -p 18080:8080 football-lottery-analysis-lab:trial
Invoke-RestMethod http://127.0.0.1:18080/api/system/build-info
Invoke-WebRequest http://127.0.0.1:18080/ -UseBasicParsing
docker stop football-lottery-trial-check
```

Expected: image build exits 0; build-info returns code 200 and version 0.2.0; root returns HTTP 200. Always stop only the named owned container in `finally`.

- [ ] **Step 5: Commit deployment configuration**

```powershell
git add Dockerfile .dockerignore render.yaml
git commit -m "build: add the Render public trial container"
```

### Task 4: Publish truthful trial documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the Public Trial section**

Document that the URL is assigned by Render after authorization, first access can take about one minute, sleep/restart/redeploy/upgrade can clear all trial data, sensitive/unauthorized images must not be uploaded, and Issues are the feedback path. Do not claim durable storage, production readiness, users, adoption, or Codex for Open Source approval.

Add a Deploy to Render link targeting the repository Blueprint:

```text
https://render.com/deploy?repo=https://github.com/TomLeo-ai/football-lottery-analysis-lab
```

- [ ] **Step 2: Run the one repository policy check**

Run: `npm.cmd run compliance:scan`

Expected: PASS. Do not run `verify:stage9` locally.

- [ ] **Step 3: Check the final diff and commit**

```powershell
git diff --check
git add README.md
git commit -m "docs: explain the disposable public trial"
```

### Task 5: Deliver through GitHub and Render

**Files:** none unless the single CI or deployment smoke reveals a scoped defect.

- [ ] **Step 1: Push and open a Ready PR**

Push `codex/public-trial-deployment`, create a Ready PR to `main`, and describe the disposable-data boundary and exact minimal validation.

- [ ] **Step 2: Wait for one required GitHub check**

Wait only for repository check `verify`. If it fails, inspect and retest only the failing scope. On success, squash merge and confirm the merge SHA.

- [ ] **Step 3: Authorize the Render Blueprint**

Open the Deploy to Render URL. The maintainer authorizes Render's GitHub access and confirms the free service. Do not add payment, persistent disk, database, or LLM credentials.

- [ ] **Step 4: Run one public core-flow smoke**

On the assigned `onrender.com` URL:

1. confirm the full warning is visible;
2. open Screenshot OCR and confirm the compact warning;
3. load the checked-in fictional sample;
4. run local OCR;
5. open review and save one editable draft;
6. stop without running analysis, settlement, cross-browser, load, or repeated regression checks.

- [ ] **Step 5: Record the real URL and evidence**

Update README with the assigned URL only after it responds successfully, create a small documentation PR if the URL could not be known before deployment, and update ignored local `handoff.md`. Never convert the deployment itself into an adoption claim.
