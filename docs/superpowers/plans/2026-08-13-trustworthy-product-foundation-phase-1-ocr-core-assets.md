# Trustworthy Product Foundation Phase 1: OCR Core and Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing empty OCR package with a framework-neutral, tested TypeScript contract; vendor exactly versioned same-origin OCR runtime assets with integrity/license evidence; and add a rights-safe fictional golden image whose labeled fields can be mapped without inventing data.

**Architecture:** `packages/ocr-core` owns pure types, geometry, validation, confidence normalization, and deterministic labeled-field mapping. A repository script copies an allowlisted Tesseract worker/core/language set from locked npm dependencies into `apps/web/public/ocr`, writes no network-dependent runtime logic, and a separate verifier checks file names, sizes, SHA-256 values, dependency versions, and third-party notices. The Vue browser adapter is intentionally deferred to Phase 2.

**Tech Stack:** TypeScript, Vitest, Node.js crypto/fs, Tesseract.js 7.0.0, tesseract.js-core 7.0.0, `@tesseract.js-data/eng` 1.0.0, `@tesseract.js-data/chi_sim` 1.0.0, Playwright only for deterministic fictional fixture rendering.

---

## Task 1: Turn `packages/ocr-core` into a tested workspace

**Files:**

- Create: `packages/ocr-core/package.json`
- Create: `packages/ocr-core/tsconfig.json`
- Create: `packages/ocr-core/vitest.config.ts`
- Create: `packages/ocr-core/src/index.ts`
- Create: `packages/ocr-core/src/contracts.ts`
- Create: `packages/ocr-core/src/contracts.spec.ts`
- Modify: `packages/ocr-core/README.md`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing public-contract test**

Create `packages/ocr-core/src/contracts.spec.ts` with exact enum/limit assertions:

```ts
import { describe, expect, it } from 'vitest'
import {
  IMAGE_POLICY,
  OCR_CANDIDATE_SCHEMA_VERSION,
  PLAY_TYPES,
  SELECTIONS,
  SOURCE_DECLARATIONS,
} from './contracts'

describe('OCR public contracts', () => {
  it('locks the v2 image and market policy', () => {
    expect(IMAGE_POLICY).toEqual({
      acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      maxBytes: 10 * 1024 * 1024,
      maxPixels: 25_000_000,
      maxOcrEdge: 2_400,
    })
    expect(OCR_CANDIDATE_SCHEMA_VERSION).toBe('OCR_CANDIDATE_V2')
    expect(SOURCE_DECLARATIONS).toEqual(['FICTIONAL_SAMPLE', 'USER_OWNED_AUTHORIZED'])
    expect(PLAY_TYPES).toEqual(['WIN_DRAW_LOSS'])
    expect(SELECTIONS).toEqual(['HOME_WIN', 'DRAW', 'AWAY_WIN'])
  })
})
```

- [ ] **Step 2: Run the test and observe RED**

```powershell
npm.cmd run test -w packages/ocr-core -- src/contracts.spec.ts
```

Expected: non-zero exit because the package and exported contract do not exist.

- [ ] **Step 3: Add package configuration and minimal contracts**

Use this package boundary:

```json
{
  "name": "@football-lottery-analysis-lab/ocr-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "vitest": "4.1.9"
  }
}
```

Export readonly constants and derived union types from `contracts.ts`; do not depend on DOM, Vue, Pinia, or a backend DTO.

- [ ] **Step 4: Run GREEN and typecheck**

```powershell
npm.cmd install --ignore-scripts
npm.cmd run test -w packages/ocr-core -- src/contracts.spec.ts
npm.cmd run typecheck -w packages/ocr-core
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit the workspace skeleton**

```powershell
git add packages/ocr-core package-lock.json
git commit -m "feat: establish OCR core contracts"
```

## Task 2: Define image geometry and bounding-box transforms

**Files:**

- Create: `packages/ocr-core/src/geometry.ts`
- Create: `packages/ocr-core/src/geometry.spec.ts`
- Modify: `packages/ocr-core/src/index.ts`

- [ ] **Step 1: Write table-driven RED tests**

Cover `0/90/180/270` rotation, a single crop, multiple redaction rectangles, longest-edge scaling, and invalid/non-finite boxes. The central assertion must use explicit source and processed dimensions:

```ts
expect(transformBoundingBox(
  { x: 10, y: 20, width: 30, height: 40 },
  { sourceWidth: 200, sourceHeight: 100, rotation: 90,
    crop: { x: 20, y: 10, width: 60, height: 120 }, scale: 0.5 },
)).toEqual({ x: 20, y: 85, width: 20, height: 15 })
```

Also assert that a box outside the declared processed image throws `OcrCoreValidationError` rather than being clipped.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd run test -w packages/ocr-core -- src/geometry.spec.ts
```

Expected: module/export-not-found failure.

- [ ] **Step 3: Implement pure geometry functions**

Define and export:

```ts
export type Rotation = 0 | 90 | 180 | 270
export interface PixelSize { width: number; height: number }
export interface PixelRect { x: number; y: number; width: number; height: number }
export interface ProcessedImageTransform {
  schemaVersion: 'IMAGE_TRANSFORM_V1'
  sourceSize: PixelSize
  normalizedSize: PixelSize
  rotation: Rotation
  crop: PixelRect | null
  redactions: readonly PixelRect[]
  processedSize: PixelSize
}
```

Keep coordinates in normalized-orientation pixel space and validate finite non-negative values before every transform.

- [ ] **Step 4: Run GREEN**

```powershell
npm.cmd run test -w packages/ocr-core -- src/geometry.spec.ts
npm.cmd run typecheck -w packages/ocr-core
```

- [ ] **Step 5: Commit**

```powershell
git add packages/ocr-core/src
git commit -m "feat: add OCR image geometry contracts"
```

## Task 3: Validate candidate fields and map labeled OCR evidence

**Files:**

- Create: `packages/ocr-core/src/candidates.ts`
- Create: `packages/ocr-core/src/candidates.spec.ts`
- Create: `packages/ocr-core/src/mapper.ts`
- Create: `packages/ocr-core/src/mapper.spec.ts`
- Modify: `packages/ocr-core/src/index.ts`

- [ ] **Step 1: Write RED tests for the exact candidate schema**

The test matrix must cover:

- MATCH names: `matchDate`, `league`, `homeTeam`, `awayTeam`, `kickoffTime`;
- MARKET names: `matchRef`, `playType`, `selection`, `odds`;
- unique UUID `entityKey` values per entity type;
- one `matchRef` per MARKET and no orphan reference;
- at most one MARKET entity per MATCH;
- at most one `(entityType, entityKey, fieldName)` tuple;
- confidence in `[0, 1]` and bounded bbox;
- unknown/duplicate/conflicting fields reject the entire batch;
- missing optional evidence creates blank draft seed values and never invented text.

Use a two-match fixture and explicitly assert first-seen entity ordering.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd run test -w packages/ocr-core -- src/candidates.spec.ts src/mapper.spec.ts
```

- [ ] **Step 3: Implement candidate types and validation**

The public shape must be:

```ts
export interface OcrCandidateField {
  fieldId: string
  entityType: 'MATCH' | 'MARKET'
  entityKey: string
  fieldName: MatchFieldName | MarketFieldName
  fieldValue: string
  confidence: number
  boundingBox?: PixelRect
}

export interface CandidateBatch {
  schemaVersion: 'OCR_CANDIDATE_V2'
  processedImage: ProcessedImageTransform
  fields: readonly OcrCandidateField[]
}
```

Return a discriminated validation result with field paths; do not throw untyped strings.

- [ ] **Step 4: Implement conservative labeled mapping**

Accept normalized OCR lines/words and only map explicit labels from the fictional input contract:

```text
MATCH REF:
DATE:
LEAGUE:
HOME:
AWAY:
KICKOFF:
MARKET REF:
PLAY TYPE:
SELECTION:
ODDS:
```

The golden source uses the same explicit reference token on `MATCH REF` and `MARKET REF`; the mapper creates a UUID match entity key and resolves the market's `matchRef` through that token. It never relates entities by array position or fuzzy team text. When a label/value cannot be proved from OCR evidence, leave that value blank. Never derive a team, date, play type, selection, or odds from line position alone. Preserve word-derived confidence/bbox only for the exact mapped value span.

- [ ] **Step 5: Run GREEN and the complete package suite**

```powershell
npm.cmd run test -w packages/ocr-core
npm.cmd run typecheck -w packages/ocr-core
```

- [ ] **Step 6: Commit**

```powershell
git add packages/ocr-core/src
git commit -m "feat: validate and map OCR candidates"
```

## Task 4: Add the rights-safe fictional OCR fixture

**Files:**

- Create: `assets/ocr-samples/fictional-golden.html`
- Create: `assets/ocr-samples/fictional-golden.json`
- Create: `scripts/generate-fictional-ocr-sample.mjs`
- Create: `apps/web/public/ocr-samples/fictional-golden.png`
- Create: `scripts/fictional-ocr-sample.spec.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write a failing fixture-contract test**

The Node test must assert that the PNG exists, has PNG magic bytes, stays under 1 MiB, matches the SHA-256 stored in its JSON metadata, and that the metadata declares:

```json
{
  "rights": "PROJECT_GENERATED_FICTIONAL_SAMPLE",
  "containsThirdPartyMarks": false,
  "stableTokens": ["DEMO DATA", "演示联赛", "Blue Harbor", "红枫城"],
  "rawOnlySentinel": "OCR_RAW_ONLY_SENTINEL_V2_9F3A"
}
```

- [ ] **Step 2: Run RED**

```powershell
node --test scripts/fictional-ocr-sample.spec.mjs
```

- [ ] **Step 3: Create the source and deterministic renderer**

The HTML must contain two clearly labeled fictional matches, explicit `MATCH REF`/`MARKET REF` pairs, `PLAY TYPE: WIN_DRAW_LOSS`, one selected direction and odds for each match, the bilingual stable tokens, `DEMO DATA / FICTIONAL SAMPLE`, and the raw-only sentinel in a region the candidate mapper deliberately does not map. It must contain no third-party logos, real league names, screenshots, or copyrighted artwork.

The generator must use the repository-pinned Playwright Chromium, fixed viewport/fonts/colors, `deviceScaleFactor: 1`, and `animations: 'disabled'`; it writes only the target PNG. The checked-in JSON records the resulting byte count and SHA-256.

Add root script `"test:ocr-fixtures": "node --test scripts/fictional-ocr-sample.spec.mjs"` so later verification chains invoke the fixture contract by name rather than duplicating its command.

- [ ] **Step 4: Generate once and run GREEN**

```powershell
node scripts/generate-fictional-ocr-sample.mjs
node --test scripts/fictional-ocr-sample.spec.mjs
```

Expected: deterministic metadata/PNG contract passes. If the local renderer changes bytes, inspect the image before accepting a new checksum.

- [ ] **Step 5: Visually inspect the generated fixture**

Open `apps/web/public/ocr-samples/fictional-golden.png` and confirm legibility, fictional labeling, two match blocks, no clipping, and no real logo/brand. Keep the sentinel/checksum metadata under `assets/ocr-samples`, not Vite `public`, so the raw-only sentinel does not enter the production `dist`. This manual rights/legibility gate is required even when the byte test passes.

- [ ] **Step 6: Commit**

```powershell
git add assets/ocr-samples scripts/generate-fictional-ocr-sample.mjs scripts/fictional-ocr-sample.spec.mjs apps/web/public/ocr-samples package.json
git commit -m "test: add a rights-safe OCR golden fixture"
```

## Task 5: Lock OCR dependencies and vendor the runtime allowlist

**Files:**

- Modify: `apps/web/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/sync-ocr-assets.mjs`
- Create: `scripts/ocr-assets-check.mjs`
- Create: `scripts/ocr-assets-check.spec.mjs`
- Create: `apps/web/src/ocr/ocr-asset-manifest.json`
- Modify: `.gitignore`
- Generate (ignored): `apps/web/public/ocr/tesseract/7.0.0/worker/worker.min.js`
- Generate (ignored): `apps/web/public/ocr/tesseract/7.0.0/core/` (the manifest-listed 18 v7 JavaScript/WASM runtime files: base, SIMD, relaxed-SIMD, and all three LSTM variants)
- Generate (ignored): `apps/web/public/ocr/tesseract/7.0.0/lang/4.0.0_best_int/eng.traineddata.gz`
- Generate (ignored): `apps/web/public/ocr/tesseract/7.0.0/lang/4.0.0_best_int/chi_sim.traineddata.gz`

- [ ] **Step 1: Add exact direct dependency versions**

Use exact versions, not ranges:

```json
{
  "@football-lottery-analysis-lab/ocr-core": "0.1.0",
  "tesseract.js": "7.0.0",
  "tesseract.js-core": "7.0.0",
  "@tesseract.js-data/eng": "1.0.0",
  "@tesseract.js-data/chi_sim": "1.0.0"
}
```

Add Web lifecycle scripts `"predev": "node ../../scripts/sync-ocr-assets.mjs"` and `"prebuild": "node ../../scripts/sync-ocr-assets.mjs"`. Add root scripts `sync:ocr-assets`, `check:ocr-assets`, `test:ocr-assets`, `test:ocr-core`, and `lint:ocr-core` with the exact commands used later in this plan. This makes a clean `npm ci` followed by dev/build materialize same-origin assets without committing them.

Add the internal workspace dependency directly to `apps/web/package.json`; do not ask the public registry to resolve it. Install only the four public packages explicitly, then run a root install so npm links the local workspace and refreshes the lockfile:

```powershell
npm.cmd install --save-exact -w apps/web tesseract.js@7.0.0 tesseract.js-core@7.0.0 @tesseract.js-data/eng@1.0.0 @tesseract.js-data/chi_sim@1.0.0 --ignore-scripts
npm.cmd install --ignore-scripts
```

- [ ] **Step 2: Write RED tests for the verifier**

Test the verifier against temporary manifests/files and prove that it rejects:

- a missing core variant;
- an extra unmanifested file;
- one changed byte;
- wrong byte count or SHA-256;
- wrong package-lock version;
- missing language data;
- missing license/notice entry;
- any HTTP/CDN URL in runtime manifest fields.

Run:

```powershell
node --test scripts/ocr-assets-check.spec.mjs
```

Expected: failure because the verifier and assets do not exist.

- [ ] **Step 3: Implement a deterministic allowlist copier**

`sync-ocr-assets.mjs` must resolve files only from the four locked packages, verify them against the checked-in manifest, validate that the resolved destination is strictly below `apps/web/public/ocr/tesseract/`, clear only that generated destination, then copy the worker, all 18 v7 core files, and the two `4.0.0_best_int` language gzip files. It must reject symlinks/path escape. The exact core allowlist is:

```text
tesseract-core.js
tesseract-core.wasm
tesseract-core.wasm.js
tesseract-core-lstm.js
tesseract-core-lstm.wasm
tesseract-core-lstm.wasm.js
tesseract-core-simd.js
tesseract-core-simd.wasm
tesseract-core-simd.wasm.js
tesseract-core-simd-lstm.js
tesseract-core-simd-lstm.wasm
tesseract-core-simd-lstm.wasm.js
tesseract-core-relaxedsimd.js
tesseract-core-relaxedsimd.wasm
tesseract-core-relaxedsimd.wasm.js
tesseract-core-relaxedsimd-lstm.js
tesseract-core-relaxedsimd-lstm.wasm
tesseract-core-relaxedsimd-lstm.wasm.js
```

The checked-in manifest implements this exact schema; its numeric sizes and 64-character lowercase SHA-256 strings are measured once from the reviewed locked packages and then treated as immutable expected values:

```ts
interface OcrAssetManifestV1 {
  schemaVersion: 'OCR_ASSET_MANIFEST_V1'
  tesseractVersion: '7.0.0'
  coreVersion: '7.0.0'
  languageDataVersion: '1.0.0/4.0.0_best_int'
  cachePath: 'football-lab-ocr/tesseract-7.0.0/4.0.0_best_int'
  workerPath: 'ocr/tesseract/7.0.0/worker/worker.min.js'
  corePath: 'ocr/tesseract/7.0.0/core/'
  langPath: 'ocr/tesseract/7.0.0/lang/4.0.0_best_int/'
  files: Array<{
    sourcePackage: string
    sourcePackagePath: string
    publicRelativePath: string
    bytes: number
    sha256: string
  }>
}
```

Never let the sync script rewrite expected hashes; otherwise a modified dependency would self-approve. Add only `apps/web/public/ocr/tesseract/` to `.gitignore`; the manifest, fixture, and license records remain tracked. Never derive a runtime CDN URL, copy all of `node_modules`, or commit the roughly tens-of-megabytes generated runtime directory.

- [ ] **Step 4: Sync assets and run the independent verifier**

```powershell
node scripts/sync-ocr-assets.mjs
node scripts/ocr-assets-check.mjs
node --test scripts/ocr-assets-check.spec.mjs
```

Expected: verifier reports the exact number of manifest files and exits `0`; every runtime URL is relative/same-origin.

## Task 6: Record direct and embedded native license obligations

**Files:**

- Create: `docs/third-party-ocr.md`
- Create: `third_party/ocr/manifest.json`
- Create: `third_party/ocr/licenses/tesseract.js-7.0.0.txt`
- Create: `third_party/ocr/licenses/tesseract.js-core-7.0.0.txt`
- Create: `third_party/ocr/licenses/tessdata-eng-1.0.0.txt`
- Create: `third_party/ocr/licenses/tessdata-chi_sim-1.0.0.txt`
- Create: `third_party/ocr/licenses/<native-component>-<version-or-commit>.txt`
- Modify: `NOTICE`
- Modify: `scripts/ocr-assets-check.mjs`
- Modify: `scripts/ocr-assets-check.spec.mjs`

- [ ] **Step 1: Extend the verifier test and observe RED**

Require one inventory row for each direct runtime package/asset and each native component named by the audited Tesseract.js-core distribution: Tesseract fork, Leptonica, libjpeg, giflib, libpng, libtiff, libwebp, zlib, and openlibm. Every row must contain component, exact version or upstream commit as available, source URL, SPDX identifier, copyright/notice source, repository path, and redistribution note.

```powershell
node --test scripts/ocr-assets-check.spec.mjs
```

Expected: non-zero because the inventory and notice files are absent.

- [ ] **Step 2: Copy upstream license/notice texts without editing them**

Use the installed packages and official upstream license files; record provenance in `docs/third-party-ocr.md`. Do not assert that Apache-2.0 for the JavaScript wrapper automatically covers unrelated data or native libraries. Do not add a component until its actual license is verified.

- [ ] **Step 3: Add concise NOTICE entries and verification**

`NOTICE` identifies Tesseract.js, tesseract.js-core, the two language-data packages, their upstream locations, and points to the full inventory. `third_party/ocr/manifest.json` is the machine-readable authority for component/version or commit/upstream/SPDX/copyright/license path. The verifier cross-checks package-lock versions, copied license files, manifest paths, sizes, and hashes.

- [ ] **Step 4: Run the complete Phase 1 gate**

```powershell
npm.cmd run test -w packages/ocr-core
npm.cmd run typecheck -w packages/ocr-core
node --test scripts/fictional-ocr-sample.spec.mjs
node --test scripts/ocr-assets-check.spec.mjs
node scripts/ocr-assets-check.mjs
npm.cmd run compliance:scan
git diff --check
```

Expected: all exit `0`; compliance scans the new source, manifest, docs, and notices; no network-dependent runtime URL or third-party image appears.

- [ ] **Step 5: Commit assets and licensing as one auditable unit**

```powershell
git add package.json apps/web/package.json package-lock.json apps/web/src/ocr/ocr-asset-manifest.json .gitignore scripts/sync-ocr-assets.mjs scripts/ocr-assets-check.mjs scripts/ocr-assets-check.spec.mjs docs/third-party-ocr.md third_party/ocr NOTICE
git commit -m "build: vendor verified OCR runtime assets"
```

## Phase 1 exit evidence

Record in the implementation handoff:

- exact dependency versions;
- manifest file count;
- worker/core/language byte counts and SHA-256 values;
- license inventory check result;
- OCR Core test count;
- golden fixture visual-review result;
- compliance and `git diff --check` results;
- confirmation that Phase 2, not Phase 1, owns real browser recognition evidence.
