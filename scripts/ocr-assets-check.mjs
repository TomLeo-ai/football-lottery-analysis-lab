import { createHash } from "node:crypto";
import { lstat, open, opendir, readFile, readdir, readlink, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "..");

const MANIFEST_RELATIVE_PATH = "apps/web/src/ocr/ocr-asset-manifest.json";
const THIRD_PARTY_MANIFEST_RELATIVE_PATH = "third_party/ocr/manifest.json";
const THIRD_PARTY_DOCUMENT_RELATIVE_PATH = "docs/third-party-ocr.md";
const NOTICE_RELATIVE_PATH = "NOTICE";
const WEB_PACKAGE_RELATIVE_PATH = "apps/web/package.json";
const LOCKFILE_RELATIVE_PATH = "package-lock.json";
const GENERATED_ROOT_RELATIVE_PATH = "apps/web/public/ocr/tesseract";
const GENERATED_VERSION = "7.0.0";

// These limits are deliberately above the locked inputs while still bounding every
// read and traversal performed on repository-controlled or installed content.
const MAX_MANIFEST_JSON_BYTES = 128 * 1024;
const MAX_PACKAGE_JSON_BYTES = 256 * 1024;
const MAX_LOCKFILE_JSON_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 64 * 1024 * 1024;
const MAX_GENERATED_DEPTH = 4;
const MAX_GENERATED_DIRECTORIES = 8;
const MAX_GENERATED_ENTRIES = 64;

const MANIFEST_KEYS = Object.freeze([
  "schemaVersion",
  "tesseractVersion",
  "coreVersion",
  "languageDataVersion",
  "cachePath",
  "workerPath",
  "corePath",
  "langPath",
  "files",
]);

const ROW_KEYS = Object.freeze([
  "sourcePackage",
  "sourcePackagePath",
  "publicRelativePath",
  "bytes",
  "sha256",
]);

export const OCR_PUBLIC_PACKAGE_VERSIONS = Object.freeze({
  "tesseract.js": "7.0.0",
  "tesseract.js-core": "7.0.0",
  "@tesseract.js-data/eng": "1.0.0",
  "@tesseract.js-data/chi_sim": "1.0.0",
});

const REQUIRED_WEB_DEPENDENCIES = Object.freeze({
  "@football-lottery-analysis-lab/ocr-core": "0.1.0",
  ...OCR_PUBLIC_PACKAGE_VERSIONS,
});

const CORE_BASENAMES = Object.freeze(
  [
    "tesseract-core",
    "tesseract-core-lstm",
    "tesseract-core-simd",
    "tesseract-core-simd-lstm",
    "tesseract-core-relaxedsimd",
    "tesseract-core-relaxedsimd-lstm",
  ].flatMap((name) => [`${name}.js`, `${name}.wasm`, `${name}.wasm.js`]),
);

export const OCR_ASSET_ALLOWLIST = Object.freeze([
  Object.freeze({
    sourcePackage: "tesseract.js",
    sourcePackagePath: "dist/worker.min.js",
    publicRelativePath: "worker/worker.min.js",
  }),
  ...CORE_BASENAMES.map((basename) => Object.freeze({
    sourcePackage: "tesseract.js-core",
    sourcePackagePath: basename,
    publicRelativePath: `core/${basename}`,
  })),
  Object.freeze({
    sourcePackage: "@tesseract.js-data/eng",
    sourcePackagePath: "4.0.0_best_int/eng.traineddata.gz",
    publicRelativePath: "lang/4.0.0_best_int/eng.traineddata.gz",
  }),
  Object.freeze({
    sourcePackage: "@tesseract.js-data/chi_sim",
    sourcePackagePath: "4.0.0_best_int/chi_sim.traineddata.gz",
    publicRelativePath: "lang/4.0.0_best_int/chi_sim.traineddata.gz",
  }),
]);

const EXPECTED_MANIFEST_VALUES = Object.freeze({
  schemaVersion: "OCR_ASSET_MANIFEST_V1",
  tesseractVersion: "7.0.0",
  coreVersion: "7.0.0",
  languageDataVersion: "1.0.0/4.0.0_best_int",
  cachePath: "football-lab-ocr/tesseract-7.0.0/4.0.0_best_int",
  workerPath: "ocr/tesseract/7.0.0/worker/worker.min.js",
  corePath: "ocr/tesseract/7.0.0/core/",
  langPath: "ocr/tesseract/7.0.0/lang/4.0.0_best_int/",
});

const EXPECTED_GENERATED_DIRECTORIES = new Set([
  GENERATED_VERSION,
  `${GENERATED_VERSION}/worker`,
  `${GENERATED_VERSION}/core`,
  `${GENERATED_VERSION}/lang`,
  `${GENERATED_VERSION}/lang/4.0.0_best_int`,
]);

const MAX_LICENSE_EXPRESSION_LENGTH = 64;
const MAX_LICENSE_FILE_BYTES = 128 * 1024;
const MAX_THIRD_PARTY_MANIFEST_BYTES = 256 * 1024;
const MAX_THIRD_PARTY_DOCUMENT_BYTES = 512 * 1024;
const MAX_NOTICE_BYTES = 128 * 1024;
const THIRD_PARTY_MANIFEST_KEYS = Object.freeze(["schemaVersion", "components"]);
const THIRD_PARTY_ROW_KEYS = Object.freeze([
  "component",
  "versionOrCommit",
  "sourceUrl",
  "spdxIdentifier",
  "copyrightOrNoticeSource",
  "repositoryLicensePath",
  "redistributionNote",
  "licensePath",
  "licenseBytes",
  "licenseSha256",
]);
const PACKAGE_LICENSE_POLICIES = Object.freeze({
  "tesseract.js": Object.freeze({
    expression: "Apache-2.0",
    requiredFile: "LICENSE.md",
  }),
  "tesseract.js-core": Object.freeze({
    expression: "Apache-2.0",
    requiredFile: "LICENSE",
  }),
  "@tesseract.js-data/eng": Object.freeze({ expression: "MIT" }),
  "@tesseract.js-data/chi_sim": Object.freeze({ expression: "MIT" }),
});

export const THIRD_PARTY_OCR_COMPONENTS = Object.freeze([
  Object.freeze({
    component: "tesseract.js",
    versionOrCommit: "7.0.0",
    sourceUrl: "https://github.com/naptha/tesseract.js/tree/v7.0.0",
    spdxIdentifier: "Apache-2.0",
    copyrightOrNoticeSource: "https://github.com/naptha/tesseract.js/blob/v7.0.0/LICENSE.md",
    repositoryLicensePath: "LICENSE.md",
    redistributionNote: "Retain the Apache-2.0 license and applicable notices when redistributing the worker package.",
    licensePath: "third_party/ocr/licenses/tesseract.js-7.0.0.txt",
  }),
  Object.freeze({
    component: "tesseract.js-core",
    versionOrCommit: "7.0.0",
    sourceUrl: "https://github.com/naptha/tesseract.js-core/tree/v7.0.0",
    spdxIdentifier: "Apache-2.0",
    copyrightOrNoticeSource: "https://github.com/naptha/tesseract.js-core/blob/v7.0.0/LICENSE",
    repositoryLicensePath: "LICENSE",
    redistributionNote: "Retain the Apache-2.0 license for the wrapper and the separately inventoried native-component notices for the WebAssembly payload.",
    licensePath: "third_party/ocr/licenses/tesseract.js-core-7.0.0.txt",
  }),
  Object.freeze({
    component: "@tesseract.js-data/eng",
    versionOrCommit: "1.0.0",
    sourceUrl: "https://github.com/naptha/tessdata/tree/b86746569320a6103cea84cc2b8d9ee74f0f45d3/4.0.0_best_int",
    spdxIdentifier: "Apache-2.0",
    copyrightOrNoticeSource: "https://github.com/tesseract-ocr/tessdata_best/blob/e9f15884bc503cf905c8a1dbbc9cb14458152628/LICENSE",
    repositoryLicensePath: "tesseract-ocr/tessdata_best/LICENSE",
    redistributionNote: "The npm wrapper declares MIT, but the shipped integerized traineddata derives from the pinned Apache-2.0 tessdata_best source; retain that data license and do not treat wrapper metadata as a data-rights grant.",
    licensePath: "third_party/ocr/licenses/tessdata-eng-1.0.0.txt",
  }),
  Object.freeze({
    component: "@tesseract.js-data/chi_sim",
    versionOrCommit: "1.0.0",
    sourceUrl: "https://github.com/naptha/tessdata/tree/b86746569320a6103cea84cc2b8d9ee74f0f45d3/4.0.0_best_int",
    spdxIdentifier: "Apache-2.0",
    copyrightOrNoticeSource: "https://github.com/tesseract-ocr/tessdata_best/blob/e9f15884bc503cf905c8a1dbbc9cb14458152628/LICENSE",
    repositoryLicensePath: "tesseract-ocr/tessdata_best/LICENSE",
    redistributionNote: "The npm wrapper declares MIT, but the shipped integerized traineddata derives from the pinned Apache-2.0 tessdata_best source; retain that data license and do not treat wrapper metadata as a data-rights grant.",
    licensePath: "third_party/ocr/licenses/tessdata-chi_sim-1.0.0.txt",
  }),
  Object.freeze({
    component: "tesseract",
    versionOrCommit: "2a9c1c49c360462733c386d2a44fcd22c4e21411",
    sourceUrl: "https://github.com/Balearica/tesseract/commit/2a9c1c49c360462733c386d2a44fcd22c4e21411",
    spdxIdentifier: "Apache-2.0",
    copyrightOrNoticeSource: "https://github.com/Balearica/tesseract/blob/2a9c1c49c360462733c386d2a44fcd22c4e21411/LICENSE",
    repositoryLicensePath: "LICENSE",
    redistributionNote: "Retain the Apache-2.0 license and applicable notices for the Tesseract fork embedded in tesseract.js-core.",
    licensePath: "third_party/ocr/licenses/tesseract-2a9c1c49c360462733c386d2a44fcd22c4e21411.txt",
  }),
  Object.freeze({
    component: "leptonica",
    versionOrCommit: "4af068b56a9674da915debea4ed7e1b9885b17e8",
    sourceUrl: "https://github.com/DanBloomberg/leptonica/commit/4af068b56a9674da915debea4ed7e1b9885b17e8",
    spdxIdentifier: "BSD-2-Clause",
    copyrightOrNoticeSource: "https://github.com/DanBloomberg/leptonica/blob/4af068b56a9674da915debea4ed7e1b9885b17e8/leptonica-license.txt",
    repositoryLicensePath: "leptonica-license.txt",
    redistributionNote: "Retain the copyright, conditions, and disclaimer in source distributions and reproduce them in binary-distribution documentation or materials.",
    licensePath: "third_party/ocr/licenses/leptonica-4af068b56a9674da915debea4ed7e1b9885b17e8.txt",
  }),
  Object.freeze({
    component: "libjpeg",
    versionOrCommit: "6c0fcb8ddee365e7abc4d332662b06900612e923",
    sourceUrl: "https://github.com/LuaDist/libjpeg/commit/6c0fcb8ddee365e7abc4d332662b06900612e923",
    spdxIdentifier: "IJG",
    copyrightOrNoticeSource: "https://github.com/LuaDist/libjpeg/blob/6c0fcb8ddee365e7abc4d332662b06900612e923/README",
    repositoryLicensePath: "README",
    redistributionNote: "Follow the IJG README conditions, including source-change indications or the required executable-code acknowledgment, as applicable.",
    licensePath: "third_party/ocr/licenses/libjpeg-6c0fcb8ddee365e7abc4d332662b06900612e923.txt",
  }),
  Object.freeze({
    component: "giflib",
    versionOrCommit: "fa37672085ce4b3d62c51627ab3c8cf2dda8009a",
    sourceUrl: "https://github.com/mirrorer/giflib/commit/fa37672085ce4b3d62c51627ab3c8cf2dda8009a",
    spdxIdentifier: "MIT",
    copyrightOrNoticeSource: "https://github.com/mirrorer/giflib/blob/fa37672085ce4b3d62c51627ab3c8cf2dda8009a/COPYING",
    repositoryLicensePath: "COPYING",
    redistributionNote: "Include the copyright and permission notice in copies or substantial portions of the software.",
    licensePath: "third_party/ocr/licenses/giflib-fa37672085ce4b3d62c51627ab3c8cf2dda8009a.txt",
  }),
  Object.freeze({
    component: "libpng",
    versionOrCommit: "a37d4836519517bdce6cb9d956092321eca3e73b",
    sourceUrl: "https://github.com/pnggroup/libpng/commit/a37d4836519517bdce6cb9d956092321eca3e73b",
    spdxIdentifier: "Libpng-2.0",
    copyrightOrNoticeSource: "https://github.com/pnggroup/libpng/blob/a37d4836519517bdce6cb9d956092321eca3e73b/LICENSE",
    repositoryLicensePath: "LICENSE",
    redistributionNote: "Retain the copyright notice; do not misrepresent origin, and plainly mark altered source versions.",
    licensePath: "third_party/ocr/licenses/libpng-a37d4836519517bdce6cb9d956092321eca3e73b.txt",
  }),
  Object.freeze({
    component: "libtiff",
    versionOrCommit: "b51bb157123264e26d34c09cc673d213aea61fc7",
    sourceUrl: "https://gitlab.com/libtiff/libtiff/-/commit/b51bb157123264e26d34c09cc673d213aea61fc7",
    spdxIdentifier: "libtiff",
    copyrightOrNoticeSource: "https://gitlab.com/libtiff/libtiff/-/blob/b51bb157123264e26d34c09cc673d213aea61fc7/COPYRIGHT",
    repositoryLicensePath: "COPYRIGHT",
    redistributionNote: "Keep the copyright and permission notice with copies and related documentation; do not use the named authors for publicity without permission.",
    licensePath: "third_party/ocr/licenses/libtiff-b51bb157123264e26d34c09cc673d213aea61fc7.txt",
  }),
  Object.freeze({
    component: "libwebp",
    versionOrCommit: "20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c",
    sourceUrl: "https://github.com/webmproject/libwebp/commit/20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c",
    spdxIdentifier: "BSD-3-Clause",
    copyrightOrNoticeSource: "https://github.com/webmproject/libwebp/blob/20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c/COPYING",
    repositoryLicensePath: "COPYING",
    redistributionNote: "Retain the notice and conditions in source distributions and reproduce them in binary-distribution documentation or materials; no endorsement.",
    licensePath: "third_party/ocr/licenses/libwebp-20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c.txt",
  }),
  Object.freeze({
    component: "zlib",
    versionOrCommit: "21767c654d31d2dccdde4330529775c6c5fd5389",
    sourceUrl: "https://github.com/madler/zlib/commit/21767c654d31d2dccdde4330529775c6c5fd5389",
    spdxIdentifier: "Zlib",
    copyrightOrNoticeSource: "https://github.com/madler/zlib/blob/21767c654d31d2dccdde4330529775c6c5fd5389/README",
    repositoryLicensePath: "README",
    redistributionNote: "Do not misrepresent origin, plainly mark altered source, and preserve the notice in source distributions.",
    licensePath: "third_party/ocr/licenses/zlib-21767c654d31d2dccdde4330529775c6c5fd5389.txt",
  }),
  Object.freeze({
    component: "openlibm",
    versionOrCommit: "ae2d91698508701c83cab83714d42a1146dccf85",
    sourceUrl: "https://github.com/JuliaMath/openlibm/commit/ae2d91698508701c83cab83714d42a1146dccf85",
    spdxIdentifier: "MIT AND ISC AND BSD-2-Clause AND SunPro",
    copyrightOrNoticeSource: "https://github.com/JuliaMath/openlibm/blob/ae2d91698508701c83cab83714d42a1146dccf85/LICENSE.md",
    repositoryLicensePath: "LICENSE.md",
    redistributionNote: "Preserve the applicable MIT, ISC, BSD-2-Clause, and SunPro notices for the compiled library portions; the upstream file separately identifies LGPL test files not embedded in the runtime.",
    licensePath: "third_party/ocr/licenses/openlibm-ae2d91698508701c83cab83714d42a1146dccf85.txt",
  }),
]);

const THIRD_PARTY_NOTICE_MARKERS = Object.freeze(
  THIRD_PARTY_OCR_COMPONENTS.map(({ component, versionOrCommit }) => `${component}@${versionOrCommit}`),
);

export class OcrAssetValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "OcrAssetValidationError";
  }
}

function fail(message) {
  throw new OcrAssetValidationError(message);
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}

function assertPlainRecord(value, label) {
  if (!isPlainRecord(value)) {
    fail(`${label} must be a plain object`);
  }
}

function readOwnData(value, key, label) {
  assertPlainRecord(value, label);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    fail(`${label} must contain required own data property ${key}`);
  }
  if (!Object.hasOwn(descriptor, "value")) {
    fail(`${label}.${key} must be an own data property; accessors are forbidden`);
  }
  return descriptor.value;
}

function assertExactKeys(value, expectedKeys, label) {
  assertPlainRecord(value, label);
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  const missingKeys = sortedExpectedKeys.filter((key) => !actualKeys.includes(key));
  const extraKeys = actualKeys.filter((key) => !sortedExpectedKeys.includes(key));

  if (missingKeys.length > 0 || extraKeys.length > 0) {
    fail(
      `${label} keys do not match the exact schema; missing=[${missingKeys.join(", ")}], extra=[${extraKeys.join(", ")}]`,
    );
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
}

function assertSafeRelativePath(value, label, { trailingSlash = false } = {}) {
  assertString(value, label);
  if (
    value.includes("\\")
    || value.includes("?")
    || value.includes("#")
    || value.includes("%")
    || value.includes("\0")
    || value.startsWith("/")
    || value.startsWith("//")
    || /^[a-z][a-z\d+.-]*:/i.test(value)
  ) {
    fail(`${label} must be a same-origin relative path without a protocol, query, hash, encoding, or backslash`);
  }

  if (trailingSlash !== value.endsWith("/")) {
    fail(`${label} ${trailingSlash ? "must" : "must not"} end with a slash`);
  }

  const pathWithoutTrailingSlash = trailingSlash ? value.slice(0, -1) : value;
  const segments = pathWithoutTrailingSlash.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    fail(`${label} contains an empty or dot path segment`);
  }

  if (path.posix.normalize(pathWithoutTrailingSlash) !== pathWithoutTrailingSlash) {
    fail(`${label} is not a canonical relative path`);
  }
}

function assertContained(basePath, candidatePath, label) {
  const absoluteBase = path.resolve(basePath);
  const absoluteCandidate = path.resolve(candidatePath);
  const relativePath = path.relative(absoluteBase, absoluteCandidate);
  if (relativePath === "" || relativePath.startsWith(`..${path.sep}`) || relativePath === ".." || path.isAbsolute(relativePath)) {
    fail(`${label} must be strictly contained by ${absoluteBase}`);
  }
  return absoluteCandidate;
}

async function assertNoLinkedPath(absolutePath, label, { allowMissing = false } = {}) {
  const resolvedPath = path.resolve(absolutePath);
  const parsedPath = path.parse(resolvedPath);
  const segments = resolvedPath.slice(parsedPath.root.length).split(path.sep).filter(Boolean);
  let cursor = parsedPath.root;

  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    let status;
    try {
      status = await lstat(cursor);
    } catch (error) {
      if (allowMissing && error?.code === "ENOENT") {
        return false;
      }
      if (error?.code === "ENOENT") {
        fail(`${label} is missing: ${cursor}`);
      }
      throw error;
    }

    if (status.isSymbolicLink()) {
      fail(`${label} contains a symlink or junction: ${cursor}`);
    }
  }

  return true;
}

async function lstatRegularFile(filePath, label) {
  await assertNoLinkedPath(filePath, label);
  let status;
  try {
    status = await lstat(filePath);
  } catch (error) {
    fail(`${label} could not be inspected: ${error?.code ?? "UNKNOWN"}: ${error?.message ?? String(error)}`);
  }
  if (status.isSymbolicLink() || !status.isFile()) {
    fail(`${label} must be a regular file without a symlink, junction, or reparse point`);
  }
  return status;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function readJsonFile(filePath, label, maximumBytes) {
  const initialStatus = await lstatRegularFile(filePath, label);
  if (initialStatus.size > maximumBytes) {
    fail(`${label} size ${initialStatus.size} exceeds the ${maximumBytes}-byte limit`);
  }

  let fileHandle;
  try {
    fileHandle = await open(filePath, "r");
  } catch (error) {
    fail(`${label} could not be opened for a bounded read: ${error?.code ?? "UNKNOWN"}: ${error?.message ?? String(error)}`);
  }

  let contents;
  try {
    const openedStatus = await fileHandle.stat();
    if (!openedStatus.isFile() || openedStatus.size > maximumBytes) {
      fail(`${label} must remain a regular file within the ${maximumBytes}-byte limit`);
    }
    if (!sameFileIdentity(initialStatus, openedStatus) || initialStatus.size !== openedStatus.size) {
      fail(`${label} changed while it was being opened`);
    }

    const buffer = Buffer.alloc(openedStatus.size);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await fileHandle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) {
        fail(`${label} changed during its bounded read`);
      }
      offset += bytesRead;
    }
    const probe = Buffer.alloc(1);
    const { bytesRead: extraBytesRead } = await fileHandle.read(probe, 0, 1, offset);
    if (extraBytesRead !== 0) {
      fail(`${label} grew during its bounded read`);
    }
    const finalOpenedStatus = await fileHandle.stat();
    if (!sameFileIdentity(openedStatus, finalOpenedStatus) || finalOpenedStatus.size !== openedStatus.size) {
      fail(`${label} changed during its bounded read`);
    }
    contents = buffer.toString("utf8");
  } catch (error) {
    if (error instanceof OcrAssetValidationError) {
      throw error;
    }
    fail(`${label} could not be read safely: ${error?.code ?? "UNKNOWN"}: ${error?.message ?? String(error)}`);
  } finally {
    await fileHandle.close().catch(() => {});
  }

  const finalStatus = await lstatRegularFile(filePath, label);
  if (!sameFileIdentity(initialStatus, finalStatus) || initialStatus.size !== finalStatus.size) {
    fail(`${label} changed during its bounded read`);
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

async function readNonemptyTextFile(filePath, label, maximumBytes) {
  const initialStatus = await lstatRegularFile(filePath, label);
  if (initialStatus.size <= 0) {
    fail(`${label} must be nonempty`);
  }
  if (initialStatus.size > maximumBytes) {
    fail(`${label} size ${initialStatus.size} exceeds the ${maximumBytes}-byte limit`);
  }

  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    fail(`${label} could not be read: ${error?.code ?? "UNKNOWN"}: ${error?.message ?? String(error)}`);
  }
  const finalStatus = await lstatRegularFile(filePath, label);
  if (!sameFileIdentity(initialStatus, finalStatus) || initialStatus.size !== finalStatus.size) {
    fail(`${label} changed while it was being read`);
  }
  if (Buffer.byteLength(contents, "utf8") !== initialStatus.size) {
    fail(`${label} bytes changed while it was being read`);
  }
  if (contents.trim().length === 0) {
    fail(`${label} must be nonempty and not whitespace-only`);
  }
  return contents;
}

function allowlistSignature(row) {
  return `${row.sourcePackage}\0${row.sourcePackagePath}\0${row.publicRelativePath}`;
}

export function validateOcrAssetManifest(manifest) {
  assertExactKeys(manifest, MANIFEST_KEYS, "OCR asset manifest");

  const manifestValues = {};
  for (const [key, expectedValue] of Object.entries(EXPECTED_MANIFEST_VALUES)) {
    const value = readOwnData(manifest, key, "OCR asset manifest");
    manifestValues[key] = value;
    assertString(value, `manifest.${key}`);
    if (value !== expectedValue) {
      fail(`manifest.${key} must equal ${JSON.stringify(expectedValue)}`);
    }
  }

  assertSafeRelativePath(manifestValues.cachePath, "manifest.cachePath");
  assertSafeRelativePath(manifestValues.workerPath, "manifest.workerPath");
  assertSafeRelativePath(manifestValues.corePath, "manifest.corePath", { trailingSlash: true });
  assertSafeRelativePath(manifestValues.langPath, "manifest.langPath", { trailingSlash: true });

  const files = readOwnData(manifest, "files", "OCR asset manifest");
  if (!Array.isArray(files)) {
    fail("manifest.files must be an array");
  }
  if (files.length !== OCR_ASSET_ALLOWLIST.length) {
    fail(`manifest.files must contain the exact 21-file allowlist; received ${files.length}`);
  }

  const sourcePaths = new Set();
  const publicPaths = new Set();
  const actualSignatures = new Set();
  let totalAssetBytes = 0;

  files.forEach((row, index) => {
    const label = `manifest.files[${index}]`;
    assertExactKeys(row, ROW_KEYS, label);
    const sourcePackage = readOwnData(row, "sourcePackage", label);
    const sourcePackagePath = readOwnData(row, "sourcePackagePath", label);
    const publicRelativePath = readOwnData(row, "publicRelativePath", label);
    const bytes = readOwnData(row, "bytes", label);
    const sha256 = readOwnData(row, "sha256", label);
    assertString(sourcePackage, `${label}.sourcePackage`);
    if (!Object.hasOwn(OCR_PUBLIC_PACKAGE_VERSIONS, sourcePackage)) {
      fail(`${label}.sourcePackage is not one of the four locked packages`);
    }
    assertSafeRelativePath(sourcePackagePath, `${label}.sourcePackagePath`);
    assertSafeRelativePath(publicRelativePath, `${label}.publicRelativePath`);

    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
      fail(`${label}.bytes must be a positive safe integer`);
    }
    if (bytes > MAX_ASSET_BYTES) {
      fail(`${label} asset bytes exceeds the ${MAX_ASSET_BYTES}-byte (8 MiB) per-file limit`);
    }
    if (totalAssetBytes > MAX_TOTAL_ASSET_BYTES - bytes) {
      fail(`manifest total asset bytes exceeds the ${MAX_TOTAL_ASSET_BYTES}-byte (64 MiB) budget`);
    }
    totalAssetBytes += bytes;
    if (typeof sha256 !== "string" || !/^[a-f\d]{64}$/.test(sha256)) {
      fail(`${label}.sha256 must be a lowercase 64-character SHA-256 string`);
    }

    const validatedRow = { sourcePackage, sourcePackagePath, publicRelativePath };
    const approvedRow = OCR_ASSET_ALLOWLIST[index];
    if (allowlistSignature(validatedRow) !== allowlistSignature(approvedRow)) {
      fail(`${label} must match the approved allowlist index and order`);
    }

    const sourcePathKey = `${sourcePackage}\0${sourcePackagePath}`;
    if (sourcePaths.has(sourcePathKey)) {
      fail(`${label} has a duplicate source package path`);
    }
    sourcePaths.add(sourcePathKey);

    if (publicPaths.has(publicRelativePath)) {
      fail(`${label} has a duplicate public relative path`);
    }
    publicPaths.add(publicRelativePath);
    actualSignatures.add(allowlistSignature(validatedRow));
  });

  const missingAllowlistEntries = OCR_ASSET_ALLOWLIST.filter(
    (entry) => !actualSignatures.has(allowlistSignature(entry)),
  );
  const expectedSignatures = new Set(OCR_ASSET_ALLOWLIST.map(allowlistSignature));
  const extraAllowlistEntries = files.filter(
    (row) => !expectedSignatures.has(allowlistSignature(row)),
  );
  if (missingAllowlistEntries.length > 0 || extraAllowlistEntries.length > 0) {
    fail(
      `manifest.files does not match the exact 21-file allowlist; missing=${missingAllowlistEntries.map(allowlistSignature).join(", ")}; extra=${extraAllowlistEntries.map(allowlistSignature).join(", ")}`,
    );
  }

  return manifest;
}

function assertHttpsUrl(value, label) {
  assertString(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS URL`);
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.hash !== ""
    || !["github.com", "gitlab.com"].includes(parsed.hostname)
  ) {
    fail(`${label} must be a direct official GitHub or GitLab HTTPS URL without credentials or a fragment`);
  }
}

export function validateThirdPartyOcrManifest(manifest) {
  assertExactKeys(manifest, THIRD_PARTY_MANIFEST_KEYS, "third-party OCR manifest");
  const schemaVersion = readOwnData(manifest, "schemaVersion", "third-party OCR manifest");
  if (schemaVersion !== "THIRD_PARTY_OCR_MANIFEST_V1") {
    fail("third-party OCR manifest.schemaVersion must equal THIRD_PARTY_OCR_MANIFEST_V1");
  }

  const components = readOwnData(manifest, "components", "third-party OCR manifest");
  if (!Array.isArray(components)) {
    fail("third-party OCR manifest.components must be an array");
  }
  if (components.length !== THIRD_PARTY_OCR_COMPONENTS.length) {
    fail(`third-party OCR manifest must contain the exact 13-component inventory; received ${components.length}`);
  }

  const componentNames = new Set();
  const licensePaths = new Set();
  components.forEach((row, index) => {
    const label = `third-party OCR manifest.components[${index}]`;
    assertExactKeys(row, THIRD_PARTY_ROW_KEYS, label);
    const expected = THIRD_PARTY_OCR_COMPONENTS[index];

    const component = readOwnData(row, "component", label);
    const licensePath = readOwnData(row, "licensePath", label);
    assertString(component, `${label}.component`);
    assertString(licensePath, `${label}.licensePath`);
    if (componentNames.has(component)) {
      fail(`${label}.component duplicates ${component}`);
    }
    if (licensePaths.has(licensePath)) {
      fail(`${label}.licensePath duplicates ${licensePath}`);
    }
    componentNames.add(component);
    licensePaths.add(licensePath);

    const versionOrCommit = readOwnData(row, "versionOrCommit", label);
    assertString(versionOrCommit, `${label}.versionOrCommit`);
    if (index < Object.keys(OCR_PUBLIC_PACKAGE_VERSIONS).length) {
      if (!/^\d+\.\d+\.\d+$/.test(versionOrCommit)) {
        fail(`${label}.versionOrCommit must be an exact semantic package version`);
      }
    } else if (!/^[a-f\d]{40}$/.test(versionOrCommit)) {
      fail(`${label}.versionOrCommit must be an exact lowercase 40-character upstream commit`);
    }

    const sourceUrl = readOwnData(row, "sourceUrl", label);
    const copyrightOrNoticeSource = readOwnData(row, "copyrightOrNoticeSource", label);
    const repositoryLicensePath = readOwnData(row, "repositoryLicensePath", label);
    const spdxIdentifier = readOwnData(row, "spdxIdentifier", label);
    const redistributionNote = readOwnData(row, "redistributionNote", label);
    assertHttpsUrl(sourceUrl, `${label}.sourceUrl`);
    assertHttpsUrl(copyrightOrNoticeSource, `${label}.copyrightOrNoticeSource`);
    assertSafeRelativePath(repositoryLicensePath, `${label}.repositoryLicensePath`);
    assertString(spdxIdentifier, `${label}.spdxIdentifier`);
    assertString(redistributionNote, `${label}.redistributionNote`);
    assertSafeRelativePath(licensePath, `${label}.licensePath`);
    if (
      !licensePath.startsWith("third_party/ocr/licenses/")
      || !/^third_party\/ocr\/licenses\/[^/]+\.txt$/.test(licensePath)
    ) {
      fail(`${label}.licensePath must be a direct third_party/ocr/licenses/*.txt path`);
    }

    for (const key of [
      "component",
      "versionOrCommit",
      "sourceUrl",
      "spdxIdentifier",
      "copyrightOrNoticeSource",
      "repositoryLicensePath",
      "redistributionNote",
      "licensePath",
    ]) {
      const actualValue = readOwnData(row, key, label);
      if (actualValue !== expected[key]) {
        fail(`${label}.${key} must equal the approved component inventory value ${JSON.stringify(expected[key])}`);
      }
    }

    const licenseBytes = readOwnData(row, "licenseBytes", label);
    if (!Number.isSafeInteger(licenseBytes) || licenseBytes <= 0) {
      fail(`${label}.licenseBytes must be a positive safe integer`);
    }
    if (licenseBytes > MAX_LICENSE_FILE_BYTES) {
      fail(`${label}.licenseBytes exceeds the ${MAX_LICENSE_FILE_BYTES}-byte limit`);
    }
    const licenseSha256 = readOwnData(row, "licenseSha256", label);
    if (typeof licenseSha256 !== "string" || !/^[a-f\d]{64}$/.test(licenseSha256)) {
      fail(`${label}.licenseSha256 must be a lowercase 64-character SHA-256 string`);
    }
  });

  return manifest;
}

function validateThirdPartyDirectPackageRows(manifest, packageEvidence) {
  for (const [packageName, expectedVersion] of Object.entries(OCR_PUBLIC_PACKAGE_VERSIONS)) {
    const row = manifest.components.find((component) => component.component === packageName);
    if (row === undefined || row.versionOrCommit !== expectedVersion) {
      fail(`third-party OCR manifest direct package ${packageName} must equal locked version ${expectedVersion}`);
    }
    if (!Object.hasOwn(packageEvidence, packageName)) {
      fail(`third-party OCR manifest direct package ${packageName} lacks Task 5 installed-package evidence`);
    }
  }
}

async function validateThirdPartyOcrFiles(paths, manifest) {
  for (const row of manifest.components) {
    const absolutePath = assertContained(
      paths.rootDirectory,
      path.resolve(paths.rootDirectory, ...row.licensePath.split("/")),
      `third-party OCR license ${row.component}`,
    );
    const status = await lstatRegularFile(absolutePath, `third-party OCR license ${row.component}`);
    if (status.size <= 0) {
      fail(`third-party OCR license ${row.component} must be nonempty`);
    }
    if (status.size > MAX_LICENSE_FILE_BYTES) {
      fail(`third-party OCR license ${row.component} exceeds the ${MAX_LICENSE_FILE_BYTES}-byte limit`);
    }
    const measurement = await measureFile(
      absolutePath,
      `third-party OCR license ${row.component}`,
      { expectedBytes: row.licenseBytes },
    );
    if (measurement.sha256 !== row.licenseSha256) {
      fail(
        `third-party OCR license ${row.component} sha256 mismatch: expected ${row.licenseSha256}, received ${measurement.sha256}`,
      );
    }
    const contents = await readNonemptyTextFile(
      absolutePath,
      `third-party OCR license ${row.component}`,
      MAX_LICENSE_FILE_BYTES,
    );
    if (contents.trim().length === 0) {
      fail(`third-party OCR license ${row.component} must be nonempty`);
    }
  }
}

function validateOcrNotice(noticeContents) {
  for (const marker of THIRD_PARTY_NOTICE_MARKERS) {
    if (!noticeContents.includes(marker)) {
      fail(`NOTICE must contain exact OCR component marker ${marker}`);
    }
  }
  for (const requiredPath of [THIRD_PARTY_DOCUMENT_RELATIVE_PATH, THIRD_PARTY_MANIFEST_RELATIVE_PATH]) {
    if (!noticeContents.includes(requiredPath)) {
      fail(`NOTICE must contain OCR audit path ${requiredPath}`);
    }
  }
}

function assertDependencyVersions(dependencies, label) {
  assertPlainRecord(dependencies, label);
  for (const [dependencyName, expectedVersion] of Object.entries(REQUIRED_WEB_DEPENDENCIES)) {
    const version = readOwnData(dependencies, dependencyName, label);
    if (version !== expectedVersion) {
      fail(`${label}.${dependencyName} must be the exact version ${expectedVersion}`);
    }
  }
}

function validateLockfile(lockfile) {
  assertPlainRecord(lockfile, "package-lock.json");
  const lockfileVersion = readOwnData(lockfile, "lockfileVersion", "package-lock.json");
  if (lockfileVersion !== 3) {
    fail("package-lock.json must use lockfileVersion 3");
  }
  const packages = readOwnData(lockfile, "packages", "package-lock.json");
  assertPlainRecord(packages, "package-lock.json packages");

  const webEntry = readOwnData(packages, "apps/web", "package-lock.json packages");
  assertPlainRecord(webEntry, "package-lock.json apps/web entry");
  assertDependencyVersions(
    readOwnData(webEntry, "dependencies", "package-lock.json apps/web entry"),
    "package-lock.json apps/web dependencies",
  );

  const internalEntry = readOwnData(
    packages,
    "node_modules/@football-lottery-analysis-lab/ocr-core",
    "package-lock.json packages",
  );
  assertPlainRecord(internalEntry, "package-lock.json OCR Core workspace entry");
  const internalLink = readOwnData(
    internalEntry,
    "link",
    "package-lock.json OCR Core workspace entry",
  );
  const internalResolved = readOwnData(
    internalEntry,
    "resolved",
    "package-lock.json OCR Core workspace entry",
  );
  if (internalLink !== true || internalResolved !== "packages/ocr-core") {
    fail("package-lock.json OCR Core dependency must be an exact internal workspace link to packages/ocr-core");
  }

  const internalWorkspace = readOwnData(packages, "packages/ocr-core", "package-lock.json packages");
  assertPlainRecord(internalWorkspace, "package-lock.json packages/ocr-core entry");
  const internalName = readOwnData(
    internalWorkspace,
    "name",
    "package-lock.json packages/ocr-core entry",
  );
  const internalVersion = readOwnData(
    internalWorkspace,
    "version",
    "package-lock.json packages/ocr-core entry",
  );
  if (
    internalName !== "@football-lottery-analysis-lab/ocr-core"
    || internalVersion !== "0.1.0"
  ) {
    fail("package-lock.json packages/ocr-core workspace must be @football-lottery-analysis-lab/ocr-core 0.1.0");
  }

  for (const [packageName, expectedVersion] of Object.entries(OCR_PUBLIC_PACKAGE_VERSIONS)) {
    const packageEntry = readOwnData(
      packages,
      `node_modules/${packageName}`,
      "package-lock.json packages",
    );
    assertPlainRecord(packageEntry, `package-lock.json ${packageName} entry`);
    const packageVersion = readOwnData(
      packageEntry,
      "version",
      `package-lock.json ${packageName} entry`,
    );
    if (packageVersion !== expectedVersion) {
      fail(`package-lock.json ${packageName} must resolve exactly to ${expectedVersion}`);
    }
  }
}

async function measureFile(filePath, label, { expectedBytes } = {}) {
  const initialStatus = await lstatRegularFile(filePath, label);
  if (initialStatus.size > MAX_ASSET_BYTES) {
    fail(`${label} size ${initialStatus.size} exceeds the ${MAX_ASSET_BYTES}-byte (8 MiB) size limit`);
  }
  if (expectedBytes !== undefined && initialStatus.size !== expectedBytes) {
    fail(`${label} bytes mismatch: expected ${expectedBytes}, received ${initialStatus.size}`);
  }

  let fileHandle;
  try {
    fileHandle = await open(filePath, "r");
  } catch (error) {
    fail(`${label} could not be opened for hashing: ${error?.code ?? "UNKNOWN"}: ${error?.message ?? String(error)}`);
  }

  const hash = createHash("sha256");
  let measuredBytes = 0;
  try {
    const openedStatus = await fileHandle.stat();
    if (!openedStatus.isFile() || openedStatus.size > MAX_ASSET_BYTES) {
      fail(`${label} must remain a regular file within the ${MAX_ASSET_BYTES}-byte size limit`);
    }
    if (!sameFileIdentity(initialStatus, openedStatus) || openedStatus.size !== initialStatus.size) {
      fail(`${label} changed while it was being opened for hashing`);
    }

    const stream = fileHandle.createReadStream({ autoClose: false });
    for await (const chunk of stream) {
      measuredBytes += chunk.byteLength;
      if (measuredBytes > MAX_ASSET_BYTES) {
        fail(`${label} exceeded the ${MAX_ASSET_BYTES}-byte size limit while hashing`);
      }
      if (expectedBytes !== undefined && measuredBytes > expectedBytes) {
        fail(`${label} bytes mismatch: expected ${expectedBytes}, received more than ${expectedBytes}`);
      }
      hash.update(chunk);
    }

    const finalOpenedStatus = await fileHandle.stat();
    if (!sameFileIdentity(openedStatus, finalOpenedStatus) || finalOpenedStatus.size !== openedStatus.size) {
      fail(`${label} changed while it was being hashed`);
    }
  } catch (error) {
    if (error instanceof OcrAssetValidationError) {
      throw error;
    }
    fail(`${label} could not be hashed safely: ${error?.code ?? "UNKNOWN"}: ${error?.message ?? String(error)}`);
  } finally {
    await fileHandle.close().catch(() => {});
  }

  const finalStatus = await lstatRegularFile(filePath, label);
  if (!sameFileIdentity(initialStatus, finalStatus) || finalStatus.size !== initialStatus.size) {
    fail(`${label} changed while it was being hashed`);
  }
  if (measuredBytes !== initialStatus.size) {
    fail(`${label} bytes changed while hashing: expected ${initialStatus.size}, received ${measuredBytes}`);
  }
  return {
    bytes: measuredBytes,
    sha256: hash.digest("hex"),
  };
}

async function validateLicenseFile(licensePath, packageName, fileName) {
  const label = `installed package ${packageName} license file ${fileName}`;
  await assertNoLinkedPath(licensePath, label);
  const status = await lstat(licensePath);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail(`${label} must be a regular file without a reparse point`);
  }
  if (status.size <= 0) {
    fail(`${label} content must not be empty`);
  }
  if (status.size > MAX_LICENSE_FILE_BYTES) {
    fail(`${label} size exceeds the ${MAX_LICENSE_FILE_BYTES}-byte limit`);
  }
  let contents;
  try {
    contents = await readFile(licensePath, "utf8");
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`);
  }
  if (contents.trim().length === 0) {
    fail(`${label} content must not be empty or whitespace-only`);
  }
}

async function validatePackageLicenseEvidence(packageDirectory, packageManifest, packageName) {
  await assertNoLinkedPath(packageDirectory, `installed package ${packageName}`);
  const policy = PACKAGE_LICENSE_POLICIES[packageName];
  if (policy === undefined) {
    fail(`installed package ${packageName} has no approved license policy`);
  }
  const license = readOwnData(packageManifest, "license", `installed package ${packageName} package.json`);
  if (typeof license !== "string") {
    fail(`installed package ${packageName} license must be a string`);
  }
  if (license.length === 0 || license.trim().length === 0) {
    fail(`installed package ${packageName} license is required and must not be empty or whitespace`);
  }
  if (license.length > MAX_LICENSE_EXPRESSION_LENGTH) {
    fail(
      `installed package ${packageName} license length exceeds ${MAX_LICENSE_EXPRESSION_LENGTH} characters`,
    );
  }
  if (license !== policy.expression) {
    fail(`installed package ${packageName} license must equal exactly ${policy.expression}`);
  }

  const entries = await readdir(packageDirectory, { withFileTypes: true });
  const presentLicenseNames = entries
    .filter((entry) => /^(licen[cs]e|copying|notice)(?:\.|$)/i.test(entry.name))
    .map((entry) => entry.name);
  if (policy.requiredFile !== undefined && !presentLicenseNames.includes(policy.requiredFile)) {
    fail(`installed package ${packageName} requires fixed license file ${policy.requiredFile}`);
  }
  for (const fileName of presentLicenseNames) {
    await validateLicenseFile(path.join(packageDirectory, fileName), packageName, fileName);
  }

  return policy.requiredFile ?? "package.json#license";
}

function packageDirectoryFor(rootDirectory, packageName) {
  return path.join(rootDirectory, "node_modules", ...packageName.split("/"));
}

function pathsAreEqual(leftPath, rightPath) {
  const normalizedLeft = path.normalize(leftPath);
  const normalizedRight = path.normalize(rightPath);
  if (process.platform === "win32") {
    return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  }
  return normalizedLeft === normalizedRight;
}

async function resolveRealPath(absolutePath, label) {
  try {
    return await realpath(absolutePath);
  } catch (error) {
    fail(`${label} realpath resolution failed: ${error?.code ?? "UNKNOWN"}: ${error?.message ?? String(error)}`);
  }
}

async function validateInternalOcrCoreWorkspaceLink(paths) {
  const linkPath = assertContained(
    paths.rootDirectory,
    packageDirectoryFor(paths.rootDirectory, "@football-lottery-analysis-lab/ocr-core"),
    "installed OCR Core workspace link",
  );
  const expectedTargetPath = assertContained(
    paths.rootDirectory,
    path.join(paths.rootDirectory, "packages/ocr-core"),
    "OCR Core workspace target",
  );

  await assertNoLinkedPath(path.dirname(linkPath), "installed OCR Core workspace link parent");

  let linkStatus;
  try {
    linkStatus = await lstat(linkPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(`installed OCR Core workspace link is missing; lstat failed for ${linkPath}`);
    }
    fail(
      `installed OCR Core workspace link lstat failed: ${error?.code ?? "UNKNOWN"}: ${error?.message ?? String(error)}`,
    );
  }
  if (!linkStatus.isSymbolicLink()) {
    fail("installed OCR Core must be a symlink/junction workspace link, not an ordinary copied directory");
  }

  let declaredTarget;
  try {
    declaredTarget = await readlink(linkPath);
  } catch (error) {
    fail(
      `installed OCR Core workspace link readlink failed: ${error?.code ?? "UNKNOWN"}: ${error?.message ?? String(error)}`,
    );
  }
  const directTargetPath = path.resolve(path.dirname(linkPath), declaredTarget);
  if (!pathsAreEqual(directTargetPath, expectedTargetPath)) {
    fail(
      `installed OCR Core workspace link must point directly to the expected workspace target ${expectedTargetPath}; received ${directTargetPath}`,
    );
  }

  const [rootRealPath, expectedTargetRealPath, installedRealPath] = await Promise.all([
    resolveRealPath(paths.rootDirectory, "repository root"),
    resolveRealPath(expectedTargetPath, "expected OCR Core workspace target"),
    resolveRealPath(linkPath, "installed OCR Core workspace link"),
  ]);
  assertContained(rootRealPath, expectedTargetRealPath, "real OCR Core workspace target");
  assertContained(rootRealPath, installedRealPath, "resolved installed OCR Core workspace link");
  if (!pathsAreEqual(installedRealPath, expectedTargetRealPath)) {
    fail(
      `installed OCR Core workspace link must resolve to the expected workspace target ${expectedTargetRealPath}; received ${installedRealPath}`,
    );
  }

  const internalPackageManifest = await readJsonFile(
    path.join(expectedTargetRealPath, "package.json"),
    "installed OCR Core workspace target package.json",
    MAX_PACKAGE_JSON_BYTES,
  );
  assertPlainRecord(internalPackageManifest, "installed OCR Core workspace target package.json");
  const internalName = readOwnData(
    internalPackageManifest,
    "name",
    "installed OCR Core workspace target package.json",
  );
  if (internalName !== "@football-lottery-analysis-lab/ocr-core") {
    fail(
      "installed OCR Core package name must equal @football-lottery-analysis-lab/ocr-core",
    );
  }
  const internalVersion = readOwnData(
    internalPackageManifest,
    "version",
    "installed OCR Core workspace target package.json",
  );
  if (internalVersion !== "0.1.0") {
    fail("installed OCR Core package version must equal 0.1.0");
  }
}

export function getOcrAssetPaths(rootDirectory = DEFAULT_ROOT_DIRECTORY) {
  const absoluteRoot = path.resolve(rootDirectory);
  const publicOcrRoot = path.resolve(absoluteRoot, "apps/web/public/ocr");
  const generatedRoot = assertContained(publicOcrRoot, path.resolve(absoluteRoot, GENERATED_ROOT_RELATIVE_PATH), "generated OCR root");
  if (path.basename(generatedRoot) !== "tesseract") {
    fail("generated OCR root must end with apps/web/public/ocr/tesseract");
  }
  const generatedVersionRoot = assertContained(
    generatedRoot,
    path.join(generatedRoot, GENERATED_VERSION),
    "generated OCR version root",
  );

  return Object.freeze({
    rootDirectory: absoluteRoot,
    manifestPath: path.join(absoluteRoot, ...MANIFEST_RELATIVE_PATH.split("/")),
    thirdPartyManifestPath: path.join(absoluteRoot, ...THIRD_PARTY_MANIFEST_RELATIVE_PATH.split("/")),
    thirdPartyDocumentPath: path.join(absoluteRoot, ...THIRD_PARTY_DOCUMENT_RELATIVE_PATH.split("/")),
    noticePath: path.join(absoluteRoot, NOTICE_RELATIVE_PATH),
    webPackagePath: path.join(absoluteRoot, ...WEB_PACKAGE_RELATIVE_PATH.split("/")),
    lockfilePath: path.join(absoluteRoot, LOCKFILE_RELATIVE_PATH),
    publicOcrRoot,
    generatedRoot,
    generatedVersionRoot,
  });
}

export async function prepareOcrAssetSources({ rootDirectory = DEFAULT_ROOT_DIRECTORY } = {}) {
  const paths = getOcrAssetPaths(rootDirectory);
  await assertNoLinkedPath(paths.rootDirectory, "repository root");

  const [manifestValue, thirdPartyManifestValue, thirdPartyDocument, noticeContents, webPackage, lockfile] = await Promise.all([
    readJsonFile(paths.manifestPath, "OCR asset manifest", MAX_MANIFEST_JSON_BYTES),
    readJsonFile(
      paths.thirdPartyManifestPath,
      "third-party OCR manifest",
      MAX_THIRD_PARTY_MANIFEST_BYTES,
    ),
    readNonemptyTextFile(
      paths.thirdPartyDocumentPath,
      "third-party OCR document",
      MAX_THIRD_PARTY_DOCUMENT_BYTES,
    ),
    readNonemptyTextFile(paths.noticePath, "NOTICE", MAX_NOTICE_BYTES),
    readJsonFile(paths.webPackagePath, "apps/web/package.json", MAX_PACKAGE_JSON_BYTES),
    readJsonFile(paths.lockfilePath, "package-lock.json", MAX_LOCKFILE_JSON_BYTES),
  ]);
  const manifest = validateOcrAssetManifest(manifestValue);
  const thirdPartyManifest = validateThirdPartyOcrManifest(thirdPartyManifestValue);
  if (thirdPartyDocument.trim().length === 0) {
    fail("third-party OCR document must be nonempty");
  }
  validateOcrNotice(noticeContents);

  assertPlainRecord(webPackage, "apps/web/package.json");
  assertDependencyVersions(
    readOwnData(webPackage, "dependencies", "apps/web/package.json"),
    "apps/web/package.json dependencies",
  );
  validateLockfile(lockfile);
  await validateInternalOcrCoreWorkspaceLink(paths);

  const packageEvidence = {};
  for (const [packageName, expectedVersion] of Object.entries(OCR_PUBLIC_PACKAGE_VERSIONS)) {
    const packageRoot = packageDirectoryFor(paths.rootDirectory, packageName);
    const packageManifestPath = path.join(packageRoot, "package.json");
    const packageManifest = await readJsonFile(
      packageManifestPath,
      `installed ${packageName} package.json`,
      MAX_PACKAGE_JSON_BYTES,
    );
    assertPlainRecord(packageManifest, `installed ${packageName} package.json`);
    const installedName = readOwnData(
      packageManifest,
      "name",
      `installed package ${packageName} package.json`,
    );
    const installedVersion = readOwnData(
      packageManifest,
      "version",
      `installed package ${packageName} package.json`,
    );
    if (installedName !== packageName || installedVersion !== expectedVersion) {
      fail(`installed package ${packageName} must have exact name/version ${packageName}@${expectedVersion}`);
    }
    packageEvidence[packageName] = await validatePackageLicenseEvidence(
      packageRoot,
      packageManifest,
      packageName,
    );
  }
  validateThirdPartyDirectPackageRows(thirdPartyManifest, packageEvidence);
  await validateThirdPartyOcrFiles(paths, thirdPartyManifest);

  const sourceRows = [];
  for (const row of manifest.files) {
    const packageRoot = packageDirectoryFor(paths.rootDirectory, row.sourcePackage);
    const sourcePath = assertContained(
      packageRoot,
      path.resolve(packageRoot, ...row.sourcePackagePath.split("/")),
      `source ${row.sourcePackage}/${row.sourcePackagePath}`,
    );
    const measurement = await measureFile(
      sourcePath,
      `source ${row.sourcePackage}/${row.sourcePackagePath}`,
      { expectedBytes: row.bytes },
    );
    if (measurement.sha256 !== row.sha256) {
      fail(
        `source ${row.sourcePackage}/${row.sourcePackagePath} sha256 mismatch: expected ${row.sha256}, received ${measurement.sha256}`,
      );
    }
    sourceRows.push(Object.freeze({ row, sourcePath }));
  }

  return Object.freeze({
    paths,
    manifest,
    thirdPartyManifest,
    sourceRows: Object.freeze(sourceRows),
    packageEvidence: Object.freeze(packageEvidence),
  });
}

async function inspectGeneratedTree(
  rootDirectory,
  {
    label = "generated OCR directory",
    expectedFiles,
    expectedDirectories,
  } = {},
) {
  await assertNoLinkedPath(rootDirectory, label);
  let rootStatus;
  try {
    rootStatus = await lstat(rootDirectory);
  } catch (error) {
    fail(`${label} could not be inspected: ${error?.code ?? "UNKNOWN"}: ${error?.message ?? String(error)}`);
  }
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
    fail(`${label} must be a regular directory without a symlink, junction, or reparse point`);
  }

  const foundFiles = new Set();
  const pendingDirectories = [{ absolutePath: rootDirectory, relativePath: "", depth: 0 }];
  let directoryCount = 0;
  let entryCount = 0;
  let totalBytes = 0;

  while (pendingDirectories.length > 0) {
    const current = pendingDirectories.pop();
    let directory;
    try {
      directory = await opendir(current.absolutePath);
    } catch (error) {
      fail(`${label} directory ${current.relativePath || "."} could not be opened: ${error?.code ?? "UNKNOWN"}`);
    }

    try {
      for await (const entry of directory) {
        entryCount += 1;
        if (entryCount > MAX_GENERATED_ENTRIES) {
          fail(`${label} exceeds the ${MAX_GENERATED_ENTRIES}-entry traversal budget`);
        }

        const relativePath = current.relativePath
          ? `${current.relativePath}/${entry.name}`
          : entry.name;
        const entryPath = path.join(current.absolutePath, entry.name);
        if (entry.isSymbolicLink()) {
          fail(`${label} contains a symlink or junction at ${relativePath}`);
        }

        let status;
        try {
          status = await lstat(entryPath);
        } catch (error) {
          fail(`${label} entry ${relativePath} could not be inspected: ${error?.code ?? "UNKNOWN"}`);
        }
        if (status.isSymbolicLink()) {
          fail(`${label} contains a symlink or junction at ${relativePath}`);
        }

        if (status.isDirectory()) {
          if (expectedDirectories !== undefined && !expectedDirectories.has(relativePath)) {
            fail(`unexpected generated directory ${relativePath}`);
          }
          const depth = current.depth + 1;
          if (depth > MAX_GENERATED_DEPTH) {
            fail(`${label} exceeds the ${MAX_GENERATED_DEPTH}-level depth budget at ${relativePath}`);
          }
          directoryCount += 1;
          if (directoryCount > MAX_GENERATED_DIRECTORIES) {
            fail(`${label} exceeds the ${MAX_GENERATED_DIRECTORIES}-directory traversal budget`);
          }
          pendingDirectories.push({ absolutePath: entryPath, relativePath, depth });
          continue;
        }

        if (status.isFile()) {
          if (expectedFiles !== undefined && !expectedFiles.has(relativePath)) {
            fail(`unexpected generated file ${relativePath}`);
          }
          if (status.size > MAX_ASSET_BYTES) {
            const assetLabel = relativePath.startsWith(`${GENERATED_VERSION}/`)
              ? `target ${relativePath.slice(GENERATED_VERSION.length + 1)}`
              : `${label} file ${relativePath}`;
            fail(`${assetLabel} size ${status.size} exceeds the ${MAX_ASSET_BYTES}-byte size limit`);
          }
          if (totalBytes > MAX_TOTAL_ASSET_BYTES - status.size) {
            fail(`${label} exceeds the ${MAX_TOTAL_ASSET_BYTES}-byte total asset budget`);
          }
          totalBytes += status.size;
          foundFiles.add(relativePath);
          continue;
        }

        fail(`${label} contains an unsupported entry at ${relativePath}`);
      }
    } catch (error) {
      if (error instanceof OcrAssetValidationError) {
        throw error;
      }
      fail(`${label} traversal failed at ${current.relativePath || "."}: ${error?.code ?? "UNKNOWN"}`);
    } finally {
      await directory.close().catch((error) => {
        if (error?.code !== "ERR_DIR_CLOSED") {
          throw error;
        }
      });
    }
  }

  return foundFiles;
}

async function assertGeneratedTreeHasNoLinks(rootDirectory) {
  await inspectGeneratedTree(rootDirectory);
}

export async function verifyOcrAssetTree(prepared, treeRoot, { label = "OCR asset tree" } = {}) {
  const { manifest } = prepared;
  const absoluteTreeRoot = path.resolve(treeRoot);
  const expectedFiles = manifest.files.map(
    (row) => `${GENERATED_VERSION}/${row.publicRelativePath}`,
  );
  const expectedSet = new Set(expectedFiles);
  const actualSet = await inspectGeneratedTree(absoluteTreeRoot, {
    label,
    expectedFiles: expectedSet,
    expectedDirectories: EXPECTED_GENERATED_DIRECTORIES,
  });
  const missingFiles = expectedFiles.filter((filePath) => !actualSet.has(filePath));
  if (missingFiles.length > 0) {
    fail(
      `generated OCR targets do not match the manifest; missing=[${missingFiles.join(", ")}]`,
    );
  }

  for (const row of manifest.files) {
    const versionRoot = path.join(absoluteTreeRoot, GENERATED_VERSION);
    const targetPath = assertContained(
      versionRoot,
      path.resolve(versionRoot, ...row.publicRelativePath.split("/")),
      `target ${row.publicRelativePath}`,
    );
    const measurement = await measureFile(
      targetPath,
      `target ${row.publicRelativePath}`,
      { expectedBytes: row.bytes },
    );
    if (measurement.sha256 !== row.sha256) {
      fail(
        `target ${row.publicRelativePath} sha256 mismatch: expected ${row.sha256}, received ${measurement.sha256}`,
      );
    }
  }
}

export async function verifyGeneratedOcrAssets(prepared) {
  return verifyOcrAssetTree(prepared, prepared.paths.generatedRoot, {
    label: "generated OCR root",
  });
}

export async function assertGeneratedRootSafe(paths) {
  const expectedRoot = path.resolve(paths.rootDirectory, ...GENERATED_ROOT_RELATIVE_PATH.split("/"));
  if (paths.generatedRoot !== expectedRoot) {
    fail(`generated OCR root is not the authorized directory: ${paths.generatedRoot}`);
  }
  assertContained(paths.publicOcrRoot, paths.generatedRoot, "generated OCR root");
  await assertNoLinkedPath(paths.publicOcrRoot, "public OCR root", { allowMissing: true });
  const generatedRootExists = await assertNoLinkedPath(
    paths.generatedRoot,
    "generated OCR root",
    { allowMissing: true },
  );
  if (generatedRootExists) {
    await assertGeneratedTreeHasNoLinks(paths.generatedRoot);
  }
}

export async function checkOcrAssets(options = {}) {
  const prepared = await prepareOcrAssetSources(options);
  await verifyGeneratedOcrAssets(prepared);
  const totalBytes = prepared.manifest.files.reduce((total, row) => total + row.bytes, 0);
  return Object.freeze({
    fileCount: prepared.manifest.files.length,
    licenseCount: prepared.thirdPartyManifest.components.length,
    totalBytes,
    packageEvidence: prepared.packageEvidence,
  });
}

function isDirectExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    const result = await checkOcrAssets();
    console.log(`OCR asset check passed: ${result.fileCount} files, ${result.totalBytes} bytes.`);
  } catch (error) {
    console.error(`[ocr-assets-check] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
