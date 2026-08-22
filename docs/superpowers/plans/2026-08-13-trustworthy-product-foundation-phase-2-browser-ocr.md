# Trustworthy Product Foundation Phase 2: Browser OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read real PNG/JPEG/WebP pixels in the browser, create a non-destructive rotate/crop/redact work copy, run the vendored Tesseract worker with no external fallback, map only evidenced fields, and expose cancellation/manual-entry paths without persisting user pixels or raw OCR.

**Architecture:** Browser-specific code lives under `apps/web/src/ocr` and depends inward on `@football-lottery-analysis-lab/ocr-core`. `ImageWorkspaceController` owns all pixel resources; `TesseractOcrAdapter` owns one lazy worker; `OcrRunController` owns run tokens and cancellation; Vue components own accessible controls and presentation. Raw recognition data remains a local variable and is discarded after candidate mapping.

**Tech Stack:** Vue 3.5 Composition API, TypeScript, Canvas, ImageBitmap, Tesseract.js 7, Vitest with injected browser fakes, Playwright Chromium for the first real recognition proof.

---

## Task 1: Validate image headers before full decode

**Files:**

- Create: `apps/web/src/ocr/browserImageFile.ts`
- Create: `apps/web/src/ocr/browserImageFile.spec.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Write RED tests with tiny binary fixtures**

Cover valid PNG, JPEG SOF, WebP VP8/VP8L/VP8X dimensions; MIME/magic mismatch; GIF/SVG/PDF/HEIC rejection; truncated headers; exactly 10 MiB and one byte over; exactly 25,000,000 pixels and one pixel over; zero/overflow dimensions.

The API contract is:

```ts
export interface ImageHeader {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
}

export async function inspectImageFileHeader(file: File): Promise<ImageHeader>
```

- [ ] **Step 2: Run RED**

```powershell
npm.cmd run test -w apps/web -- src/ocr/browserImageFile.spec.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement bounded header parsing**

Read only the bytes required for a supported header/marker scan before full decode. Enforce the Phase 1 `IMAGE_POLICY`; return typed codes `UNSUPPORTED_IMAGE_TYPE`, `IMAGE_TOO_LARGE`, or `IMAGE_DECODE_FAILED`. Do not call `File.text()`, log the file name, or create an Object URL during header inspection.

- [ ] **Step 4: Add post-decode verification**

Expose:

```ts
export function assertDecodedImageMatchesHeader(
  header: ImageHeader,
  decoded: { width: number; height: number },
): void
```

It rechecks pixel limits and fails closed on inconsistent dimensions; no silent MIME correction.

- [ ] **Step 5: Run GREEN**

```powershell
npm.cmd run test -w apps/web -- src/ocr/browserImageFile.spec.ts
npm.cmd run lint:web
```

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/ocr/browserImageFile.ts apps/web/src/ocr/browserImageFile.spec.ts apps/web/package.json
git commit -m "feat: validate browser OCR image inputs"
```

## Task 2: Build the non-destructive image workspace

**Files:**

- Create: `apps/web/src/ocr/imageWorkspace.ts`
- Create: `apps/web/src/ocr/imageWorkspace.spec.ts`

- [ ] **Step 1: Write RED lifecycle and geometry tests**

Inject `createImageBitmap`, Object URL, Canvas, and 2D context factories. Assert:

- EXIF orientation normalization occurs exactly once at initial decode;
- rotations are only 90-degree steps;
- one crop and many opaque redactions are applied before OCR; before writing a `ProcessedImageTransform`, `ImageWorkspaceController` normalizes the interactive crop to the integer `x`/`y`/`width`/`height` actually used by Canvas drawing, and metadata stores that integer crop rather than a separate fractional intent;
- longest-edge sizing uses `scaleToLongestEdge(rotatedOrCroppedIntegerSize, 2400)`: the returned positive-integer `processedSize` is the actual Canvas size, a smaller image is not enlarged, the longest axis is exactly `2400` when reduced, and the other axis uses `Math.max(1, Math.round(other * 2400 / longest))`;
- returned transform metadata matches the processed Canvas dimensions exactly, and its bounding-box mapping uses the actual `scaleX`/`scaleY` implied by those dimensions, which may differ slightly after short-axis integer rounding;
- selecting another file disposes the old bitmap/URL/canvas;
- `dispose()` is idempotent and calls `URL.revokeObjectURL`, `ImageBitmap.close`, and clears Canvas dimensions.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd run test -w apps/web -- src/ocr/imageWorkspace.spec.ts
```

- [ ] **Step 3: Implement an owning controller**

Use this public boundary:

```ts
export interface ImageWorkspaceSnapshot {
  previewUrl: string
  normalizedWidth: number
  normalizedHeight: number
  rotation: 0 | 90 | 180 | 270
  crop: PixelRect | null
  redactions: readonly PixelRect[]
}

export class ImageWorkspaceController {
  static async create(file: File, deps?: ImageWorkspaceDependencies): Promise<ImageWorkspaceController>
  snapshot(): ImageWorkspaceSnapshot
  rotate(direction: 'LEFT' | 'RIGHT'): void
  setCrop(crop: PixelRect | null): void
  addRedaction(rect: PixelRect): void
  removeRedaction(index: number): void
  clearRedactions(): void
  renderForOcr(): ProcessedCanvasResult
  dispose(): void
}
```

The source `File` and bitmap are private; no getter may expose them to Pinia or API code.

`setCrop` may receive interaction coordinates, but `renderForOcr()` must normalize them to the fully bounded integer Canvas crop before constructing `ProcessedImageTransform`; a null crop continues to mean the complete rotated integer image. The stored transform crop is the exact integer rectangle supplied to Canvas drawing, never a fractional UI-intent rectangle.

- [ ] **Step 4: Run GREEN and leak assertions**

```powershell
npm.cmd run test -w apps/web -- src/ocr/imageWorkspace.spec.ts
npm.cmd run lint:web
```

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/ocr/imageWorkspace.ts apps/web/src/ocr/imageWorkspace.spec.ts
git commit -m "feat: add browser image workbench"
```

## Task 3: Implement the same-origin Tesseract adapter

**Files:**

- Create: `apps/web/src/ocr/tesseractOcrAdapter.ts`
- Create: `apps/web/src/ocr/tesseractOcrAdapter.spec.ts`
- Create: `apps/web/src/ocr/ocrAssetManifest.ts`

- [ ] **Step 1: Write a failing adapter contract test**

Inject a fake `createWorker` and assert the exact resolved options:

```ts
expect(options).toMatchObject({
  workerPath: '/ocr/tesseract/7.0.0/worker/worker.min.js',
  corePath: '/ocr/tesseract/7.0.0/core/',
  langPath: '/ocr/tesseract/7.0.0/lang/4.0.0_best_int/',
  cachePath: 'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int',
  cacheMethod: cacheAvailable ? 'write' : 'none',
  gzip: true,
  legacyCore: false,
  legacyLang: false,
  workerBlobURL: false,
})
expect(languages).toEqual(['eng', 'chi_sim'])
expect(oem).toBe(OEM.LSTM_ONLY)
```

Also assert `recognize(canvas, {}, { text: true, blocks: true })`, progress forwarding, public-model cache warning behavior, asset/worker failure mapping, empty text, and `terminate()` idempotence. Detect IndexedDB availability through an injected cache-capability probe before worker creation; when unavailable, use `cacheMethod: 'none'`, report a cache warning, and still load only the same-origin manifest assets. Recheck that probe before later recognitions only to surface cache loss: if the Worker is already initialized, keep that Worker/model in memory, warn, and continue without recreating it or reaching an external origin.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd run test -w apps/web -- src/ocr/tesseractOcrAdapter.spec.ts
```

- [ ] **Step 3: Resolve asset URLs from BASE_URL and the checked manifest**

Normalize `import.meta.env.BASE_URL` once and reject any resolved `http://`, `https://`, protocol-relative, or off-base path. `corePath` remains a directory so the v7 loader can select fallback/SIMD/relaxed-SIMD variants.

- [ ] **Step 4: Implement lazy worker reuse and recognition**

Use one worker per page session, initialize on the first recognition request, and return only the OCR Core adapter result:

```ts
export interface BrowserOcrResult {
  text: string
  lines: readonly OcrEvidenceLine[]
  meanConfidence: number
}
```

`text` must never leave the adapter/run-controller call stack except to the candidate mapper. If IndexedDB persistence fails after the model is already usable, return a cache warning and continue; if the model cannot load, return `OCR_ASSET_UNAVAILABLE`.

- [ ] **Step 5: Run GREEN**

```powershell
npm.cmd run test -w apps/web -- src/ocr/tesseractOcrAdapter.spec.ts
npm.cmd run lint:web
```

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/ocr
git commit -m "feat: add same-origin Tesseract adapter"
```

## Task 4: Make cancellation and late-result handling race-safe

**Files:**

- Create: `apps/web/src/ocr/ocrRunController.ts`
- Create: `apps/web/src/ocr/ocrRunController.spec.ts`

- [ ] **Step 1: Write RED concurrency tests**

Use deferred promises to cover cancellation during worker initialization, cancellation during recognition, replacement file during recognition, component unmount, failed run then retry, and five sequential runs. Assert:

- old tokens never invoke the result callback;
- old tokens never invoke the parse/API callback;
- termination occurs once per cancelled worker;
- retry creates exactly one new worker;
- active worker count returns to zero on dispose;
- a cancelled run surfaces `OCR_CANCELLED`, not a fake empty success.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd run test -w apps/web -- src/ocr/ocrRunController.spec.ts
```

- [ ] **Step 3: Implement the monotonic token controller**

```ts
export class OcrRunController {
  private token = 0
  async run(input: ProcessedCanvasResult): Promise<OcrCandidateDraftSeed>
  async cancel(): Promise<void>
  async replaceInput(): Promise<void>
  async dispose(): Promise<void>
}
```

Increment before each run and before every cancellation/replace/dispose. Check the captured token after adapter initialization, after `recognize`, after mapping, and immediately before any UI/API callback.

- [ ] **Step 4: Run GREEN**

```powershell
npm.cmd run test -w apps/web -- src/ocr/ocrRunController.spec.ts
npm.cmd run lint:web
```

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/ocr/ocrRunController.ts apps/web/src/ocr/ocrRunController.spec.ts
git commit -m "feat: make browser OCR cancellation race-safe"
```

## Task 5: Add accessible source, image, and OCR controls

**Files:**

- Create: `apps/web/src/components/ocr/SourceDeclarationPanel.vue`
- Create: `apps/web/src/components/ocr/SourceDeclarationPanel.spec.ts`
- Create: `apps/web/src/components/ocr/ImageWorkspace.vue`
- Create: `apps/web/src/components/ocr/ImageWorkspace.spec.ts`
- Create: `apps/web/src/components/ocr/OcrRunPanel.vue`
- Create: `apps/web/src/components/ocr/OcrRunPanel.spec.ts`
- Create: `apps/web/src/assets/ocr-workflow.css`
- Modify: `apps/web/src/main.ts`

- [ ] **Step 1: Write component RED tests**

Prove that no source is preselected; `USER_OWNED_AUTHORIZED` requires all three acknowledgements; keyboard controls can rotate/crop/redact without Canvas pointer use; progress reflects adapter stages; cancel/retry/manual entry are distinct actions; low confidence warns but does not label data wrong.

```powershell
npm.cmd run test -w apps/web -- src/components/ocr
```

- [ ] **Step 2: Implement components with event-only boundaries**

Components receive serializable view state and emit typed commands. They must never call API functions or store the `File` globally. Use BEM classes in `ocr-workflow.css`; add `:focus-visible`, `prefers-reduced-motion`, and responsive layouts at 900px and 560px.

- [ ] **Step 3: Use the exact privacy statement**

Render this approved meaning without weakening it:

```text
图片仅在当前浏览器内处理。服务端不会接收原图、完整 OCR 文本或逐词结果；结构化候选字段会保存到本机后端供您刷新恢复，只有您确认后的快照才能进入模拟分析。
```

- [ ] **Step 4: Run GREEN and build**

```powershell
npm.cmd run test -w apps/web -- src/components/ocr
npm.cmd run lint:web
npm.cmd run build:web
```

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/components/ocr apps/web/src/assets/ocr-workflow.css apps/web/src/main.ts
git commit -m "feat: add private OCR interaction controls"
```

## Task 6: Replace the hardcoded upload demo with real local OCR

**Files:**

- Modify: `apps/web/src/views/ScreenshotUpload.vue`
- Modify: `apps/web/src/views/ScreenshotUpload.spec.ts`
- Create: `apps/web/src/stores/localOcrSession.ts`
- Create: `apps/web/src/stores/localOcrSession.spec.ts`

- [ ] **Step 1: Rewrite the view test to expose the old fake path**

Assert that selecting a file invokes header inspection and decode, clicking OCR invokes the injected adapter, and the displayed candidates come from adapter evidence. Assert the page source contains none of the former hardcoded league/team/raw strings. Capture every outgoing request and fail if any body contains `File`, `Blob`, `data:image`, Base64 image signatures, `rawText`, words, or the selected file name.

- [ ] **Step 2: Run RED against the current page**

```powershell
npm.cmd run test -w apps/web -- src/views/ScreenshotUpload.spec.ts
```

Expected: assertions fail because `runDemoOcr` uses hardcoded `BROWSER_LOCAL_MOCK`, `rawText`, and file name.

- [ ] **Step 3: Rewrite `ScreenshotUpload.vue` as an orchestrator**

Sequence: explicit source declaration → header check → decode/workspace → optional rotate/crop/redact → real OCR → candidate preview. The fictional-sample button fetches `/ocr-samples/fictional-golden.png`, wraps those real bytes in a `File`, and runs the identical pipeline. There is no Mock success path.

Until Task 8 supplies the local editable draft, keep candidates only in `localOcrSession` and label the continue action as unavailable rather than calling the legacy raw-text endpoint. Task 8 enables local editing; Phase 3 later supplies persistence. At no point is untrusted data sent through the old raw-text contract.

- [ ] **Step 4: Enforce teardown**

On new file and cancel, await run cancellation, terminate the worker, revoke Object URL, close ImageBitmap, clear Canvas, and clear the transient store. On the deliberate move to Task 8's review page, dispose every pixel/raw/worker resource but transfer only the minimized mapped candidates and source declaration; every other unmount clears the store. The store must have no persistence plugin and must reject serializing its state.

- [ ] **Step 5: Run GREEN and full Web checks**

```powershell
npm.cmd run test -w apps/web -- src/views/ScreenshotUpload.spec.ts src/stores/localOcrSession.spec.ts
npm.cmd run lint:web
npm.cmd run test:web
npm.cmd run build:web
```

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/views/ScreenshotUpload.vue apps/web/src/views/ScreenshotUpload.spec.ts apps/web/src/stores/localOcrSession.ts apps/web/src/stores/localOcrSession.spec.ts
git commit -m "feat: run real OCR in the upload page"
```

## Task 7: Prove one real recognition in Chromium

**Files:**

- Create: `scripts/real-ocr-browser-smoke.mjs`
- Create: `scripts/real-ocr-browser-smoke.spec.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write runner contract tests**

Prove the runner blocks all external HTTP(S), records worker/core/language URLs, fails if any manifest asset returns non-2xx, and always closes the browser/server. Do not fake Tesseract in the smoke itself.

- [ ] **Step 2: Run RED**

```powershell
node --test scripts/real-ocr-browser-smoke.spec.mjs
```

- [ ] **Step 3: Implement the focused production-build smoke**

Build `apps/web/dist`, serve it from a temporary same-origin server with SPA fallback, open the upload page, choose the checked fictional PNG, add one redaction away from stable tokens, run the real worker, and assert only stable tokens (`DEMO DATA`, `演示联赛`, one fictional team) plus at least one mapped match. Do not assert the entire text or exact confidence.

Block and fail all non-same-origin network requests. Verify worker, all selected core files, `eng`, and `chi_sim` URLs begin with the temporary app origin.

Assert `navigator.serviceWorker.getRegistrations()` is empty and that neither the application nor the smoke registers a Service Worker. This release proves same-origin packaged assets, not offline-PWA reload behavior.

- [ ] **Step 4: Run real GREEN**

```powershell
npm.cmd run build:web
node scripts/real-ocr-browser-smoke.mjs
```

Expected: real Tesseract evidence is printed as token names/counts only; no raw OCR body is logged; no external request occurs.

- [ ] **Step 5: Run the real-OCR gate before the draft UI**

```powershell
npm.cmd run test -w packages/ocr-core
node scripts/ocr-assets-check.mjs
npm.cmd run lint:web
npm.cmd run test:web
npm.cmd run build:web
node scripts/real-ocr-browser-smoke.mjs
npm.cmd run compliance:scan
git diff --check
```

- [ ] **Step 6: Commit**

```powershell
git add scripts/real-ocr-browser-smoke.mjs scripts/real-ocr-browser-smoke.spec.mjs package.json package-lock.json
git commit -m "test: prove real same-origin browser OCR"
```

## Task 8: Add a local editable Review Draft before persistence

**Files:**

- Rewrite: `apps/web/src/types/ocrWorkflow.ts`
- Create: `apps/web/src/review/reviewDraftValidation.ts`
- Create: `apps/web/src/review/reviewDraftValidation.spec.ts`
- Create: `apps/web/src/components/ocr/OcrCandidateEvidence.vue`
- Create: `apps/web/src/components/ocr/ReviewDraftEditor.vue`
- Create: `apps/web/src/components/ocr/ReviewMatchCard.vue`
- Create: `apps/web/src/components/ocr/ReviewMarketFields.vue`
- Rewrite: `apps/web/src/views/OcrReviewWizard.vue`
- Rewrite: `apps/web/src/views/OcrReviewWizard.spec.ts`
- Modify: `apps/web/src/views/ScreenshotUpload.vue`
- Modify: `apps/web/src/views/ScreenshotUpload.spec.ts`

- [ ] **Step 1: Write RED draft and component tests**

Starting only from minimized candidates, create/edit/reorder/delete at least two draft matches. Each draft match has exactly one referenced `WIN_DRAW_LOSS` market with one of the three selections and four-decimal odds. Cover duplicate UUIDs, orphan references, second market rejection, team/date/amount/risk validation, confirmed cascading deletion of the referenced market, low-confidence evidence display, and candidate-versus-final value separation. No formal server ID may be invented.

- [ ] **Step 2: Implement the local draft model and validation**

Use browser draft UUIDs, explicit `draftMatchKey` linkage, stable array order, and the exact server-intended limits. The editor may remain incomplete and shows local errors/warnings without claiming server authority. It accepts candidates through props/store and emits a full local draft; it does not call any API.

- [ ] **Step 3: Enable the local review transition**

After successful real OCR or `MANUAL_BLANK`, transfer only minimized candidates/source metadata into `localOcrSession` and route to the existing review entry. The Review page consumes them once, permits editing, and labels Save/Confirm as unavailable until Phase 3. Refresh or direct entry shows an explicit “not persisted yet” empty state; it never loads “latest”, recreates hardcoded demo data, or falls back to the legacy API.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm.cmd run test -w apps/web -- src/review/reviewDraftValidation.spec.ts src/views/ScreenshotUpload.spec.ts src/views/OcrReviewWizard.spec.ts
npm.cmd run lint:web
npm.cmd run test:web
npm.cmd run build:web
node scripts/real-ocr-browser-smoke.mjs
npm.cmd run compliance:scan
git diff --check
git add apps/web/src/types/ocrWorkflow.ts apps/web/src/review apps/web/src/components/ocr/OcrCandidateEvidence.vue apps/web/src/components/ocr/ReviewDraftEditor.vue apps/web/src/components/ocr/ReviewMatchCard.vue apps/web/src/components/ocr/ReviewMarketFields.vue apps/web/src/views/ScreenshotUpload.vue apps/web/src/views/ScreenshotUpload.spec.ts apps/web/src/views/OcrReviewWizard.vue apps/web/src/views/OcrReviewWizard.spec.ts
git commit -m "feat: add local editable OCR review"
```

## Phase 2 manual checkpoint

Run the Web app, open the upload page, select the fictional sample, rotate it, add/remove a redaction, run OCR, cancel once, retry, continue to Review, and edit two matches with one selected WDL market each. Expected: real progress and stable fictional tokens appear, the draft is editable without formal IDs, Save/Confirm clearly remain unavailable, no hardcoded success appears, DevTools Network shows only the app origin, and leaving the flow releases the preview/worker. Phase 3 owns durable draft submission and confirmation.
