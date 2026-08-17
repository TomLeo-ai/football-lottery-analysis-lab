import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  truncate,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SYNC_URL = new URL("./sync-ocr-assets.mjs", import.meta.url);

const PUBLIC_PACKAGES = Object.freeze({
  "tesseract.js": "7.0.0",
  "tesseract.js-core": "7.0.0",
  "@tesseract.js-data/eng": "1.0.0",
  "@tesseract.js-data/chi_sim": "1.0.0",
});

const THIRD_PARTY_COMPONENTS = Object.freeze([
  {
    component: "tesseract.js",
    versionOrCommit: "7.0.0",
    sourceUrl: "https://github.com/naptha/tesseract.js/tree/v7.0.0",
    spdxIdentifier: "Apache-2.0",
    copyrightOrNoticeSource: "https://github.com/naptha/tesseract.js/blob/v7.0.0/LICENSE.md",
    repositoryLicensePath: "LICENSE.md",
    redistributionNote: "Retain the Apache-2.0 license and applicable notices when redistributing the worker package.",
    licensePath: "third_party/ocr/licenses/tesseract.js-7.0.0.txt",
  },
  {
    component: "tesseract.js-core",
    versionOrCommit: "7.0.0",
    sourceUrl: "https://github.com/naptha/tesseract.js-core/tree/v7.0.0",
    spdxIdentifier: "Apache-2.0",
    copyrightOrNoticeSource: "https://github.com/naptha/tesseract.js-core/blob/v7.0.0/LICENSE",
    repositoryLicensePath: "LICENSE",
    redistributionNote: "Retain the Apache-2.0 license for the wrapper and the separately inventoried native-component notices for the WebAssembly payload.",
    licensePath: "third_party/ocr/licenses/tesseract.js-core-7.0.0.txt",
  },
  {
    component: "@tesseract.js-data/eng",
    versionOrCommit: "1.0.0",
    sourceUrl: "https://github.com/naptha/tessdata/tree/b86746569320a6103cea84cc2b8d9ee74f0f45d3/4.0.0_best_int",
    spdxIdentifier: "Apache-2.0",
    copyrightOrNoticeSource: "https://github.com/tesseract-ocr/tessdata_best/blob/e9f15884bc503cf905c8a1dbbc9cb14458152628/LICENSE",
    repositoryLicensePath: "tesseract-ocr/tessdata_best/LICENSE",
    redistributionNote: "The npm wrapper declares MIT, but the shipped integerized traineddata derives from the pinned Apache-2.0 tessdata_best source; retain that data license and do not treat wrapper metadata as a data-rights grant.",
    licensePath: "third_party/ocr/licenses/tessdata-eng-1.0.0.txt",
  },
  {
    component: "@tesseract.js-data/chi_sim",
    versionOrCommit: "1.0.0",
    sourceUrl: "https://github.com/naptha/tessdata/tree/b86746569320a6103cea84cc2b8d9ee74f0f45d3/4.0.0_best_int",
    spdxIdentifier: "Apache-2.0",
    copyrightOrNoticeSource: "https://github.com/tesseract-ocr/tessdata_best/blob/e9f15884bc503cf905c8a1dbbc9cb14458152628/LICENSE",
    repositoryLicensePath: "tesseract-ocr/tessdata_best/LICENSE",
    redistributionNote: "The npm wrapper declares MIT, but the shipped integerized traineddata derives from the pinned Apache-2.0 tessdata_best source; retain that data license and do not treat wrapper metadata as a data-rights grant.",
    licensePath: "third_party/ocr/licenses/tessdata-chi_sim-1.0.0.txt",
  },
  {
    component: "tesseract",
    versionOrCommit: "2a9c1c49c360462733c386d2a44fcd22c4e21411",
    sourceUrl: "https://github.com/Balearica/tesseract/commit/2a9c1c49c360462733c386d2a44fcd22c4e21411",
    spdxIdentifier: "Apache-2.0",
    copyrightOrNoticeSource: "https://github.com/Balearica/tesseract/blob/2a9c1c49c360462733c386d2a44fcd22c4e21411/LICENSE",
    repositoryLicensePath: "LICENSE",
    redistributionNote: "Retain the Apache-2.0 license and applicable notices for the Tesseract fork embedded in tesseract.js-core.",
    licensePath: "third_party/ocr/licenses/tesseract-2a9c1c49c360462733c386d2a44fcd22c4e21411.txt",
  },
  {
    component: "leptonica",
    versionOrCommit: "4af068b56a9674da915debea4ed7e1b9885b17e8",
    sourceUrl: "https://github.com/DanBloomberg/leptonica/commit/4af068b56a9674da915debea4ed7e1b9885b17e8",
    spdxIdentifier: "BSD-2-Clause",
    copyrightOrNoticeSource: "https://github.com/DanBloomberg/leptonica/blob/4af068b56a9674da915debea4ed7e1b9885b17e8/leptonica-license.txt",
    repositoryLicensePath: "leptonica-license.txt",
    redistributionNote: "Retain the copyright, conditions, and disclaimer in source distributions and reproduce them in binary-distribution documentation or materials.",
    licensePath: "third_party/ocr/licenses/leptonica-4af068b56a9674da915debea4ed7e1b9885b17e8.txt",
  },
  {
    component: "libjpeg",
    versionOrCommit: "6c0fcb8ddee365e7abc4d332662b06900612e923",
    sourceUrl: "https://github.com/LuaDist/libjpeg/commit/6c0fcb8ddee365e7abc4d332662b06900612e923",
    spdxIdentifier: "IJG",
    copyrightOrNoticeSource: "https://github.com/LuaDist/libjpeg/blob/6c0fcb8ddee365e7abc4d332662b06900612e923/README",
    repositoryLicensePath: "README",
    redistributionNote: "Follow the IJG README conditions, including source-change indications or the required executable-code acknowledgment, as applicable.",
    licensePath: "third_party/ocr/licenses/libjpeg-6c0fcb8ddee365e7abc4d332662b06900612e923.txt",
  },
  {
    component: "giflib",
    versionOrCommit: "fa37672085ce4b3d62c51627ab3c8cf2dda8009a",
    sourceUrl: "https://github.com/mirrorer/giflib/commit/fa37672085ce4b3d62c51627ab3c8cf2dda8009a",
    spdxIdentifier: "MIT",
    copyrightOrNoticeSource: "https://github.com/mirrorer/giflib/blob/fa37672085ce4b3d62c51627ab3c8cf2dda8009a/COPYING",
    repositoryLicensePath: "COPYING",
    redistributionNote: "Include the copyright and permission notice in copies or substantial portions of the software.",
    licensePath: "third_party/ocr/licenses/giflib-fa37672085ce4b3d62c51627ab3c8cf2dda8009a.txt",
  },
  {
    component: "libpng",
    versionOrCommit: "a37d4836519517bdce6cb9d956092321eca3e73b",
    sourceUrl: "https://github.com/pnggroup/libpng/commit/a37d4836519517bdce6cb9d956092321eca3e73b",
    spdxIdentifier: "Libpng-2.0",
    copyrightOrNoticeSource: "https://github.com/pnggroup/libpng/blob/a37d4836519517bdce6cb9d956092321eca3e73b/LICENSE",
    repositoryLicensePath: "LICENSE",
    redistributionNote: "Retain the copyright notice; do not misrepresent origin, and plainly mark altered source versions.",
    licensePath: "third_party/ocr/licenses/libpng-a37d4836519517bdce6cb9d956092321eca3e73b.txt",
  },
  {
    component: "libtiff",
    versionOrCommit: "b51bb157123264e26d34c09cc673d213aea61fc7",
    sourceUrl: "https://gitlab.com/libtiff/libtiff/-/commit/b51bb157123264e26d34c09cc673d213aea61fc7",
    spdxIdentifier: "libtiff",
    copyrightOrNoticeSource: "https://gitlab.com/libtiff/libtiff/-/blob/b51bb157123264e26d34c09cc673d213aea61fc7/COPYRIGHT",
    repositoryLicensePath: "COPYRIGHT",
    redistributionNote: "Keep the copyright and permission notice with copies and related documentation; do not use the named authors for publicity without permission.",
    licensePath: "third_party/ocr/licenses/libtiff-b51bb157123264e26d34c09cc673d213aea61fc7.txt",
  },
  {
    component: "libwebp",
    versionOrCommit: "20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c",
    sourceUrl: "https://github.com/webmproject/libwebp/commit/20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c",
    spdxIdentifier: "BSD-3-Clause",
    copyrightOrNoticeSource: "https://github.com/webmproject/libwebp/blob/20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c/COPYING",
    repositoryLicensePath: "COPYING",
    redistributionNote: "Retain the notice and conditions in source distributions and reproduce them in binary-distribution documentation or materials; no endorsement.",
    licensePath: "third_party/ocr/licenses/libwebp-20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c.txt",
  },
  {
    component: "zlib",
    versionOrCommit: "21767c654d31d2dccdde4330529775c6c5fd5389",
    sourceUrl: "https://github.com/madler/zlib/commit/21767c654d31d2dccdde4330529775c6c5fd5389",
    spdxIdentifier: "Zlib",
    copyrightOrNoticeSource: "https://github.com/madler/zlib/blob/21767c654d31d2dccdde4330529775c6c5fd5389/README",
    repositoryLicensePath: "README",
    redistributionNote: "Do not misrepresent origin, plainly mark altered source, and preserve the notice in source distributions.",
    licensePath: "third_party/ocr/licenses/zlib-21767c654d31d2dccdde4330529775c6c5fd5389.txt",
  },
  {
    component: "openlibm",
    versionOrCommit: "ae2d91698508701c83cab83714d42a1146dccf85",
    sourceUrl: "https://github.com/JuliaMath/openlibm/commit/ae2d91698508701c83cab83714d42a1146dccf85",
    spdxIdentifier: "MIT AND ISC AND BSD-2-Clause AND SunPro",
    copyrightOrNoticeSource: "https://github.com/JuliaMath/openlibm/blob/ae2d91698508701c83cab83714d42a1146dccf85/LICENSE.md",
    repositoryLicensePath: "LICENSE.md",
    redistributionNote: "Preserve the applicable MIT, ISC, BSD-2-Clause, and SunPro notices for the compiled library portions; the upstream file separately identifies LGPL test files not embedded in the runtime.",
    licensePath: "third_party/ocr/licenses/openlibm-ae2d91698508701c83cab83714d42a1146dccf85.txt",
  },
]);

const THIRD_PARTY_NOTICE_MARKERS = Object.freeze(
  THIRD_PARTY_COMPONENTS.map(({ component, versionOrCommit }) => `${component}@${versionOrCommit}`),
);

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

const FILE_DEFINITIONS = Object.freeze([
  {
    sourcePackage: "tesseract.js",
    sourcePackagePath: "dist/worker.min.js",
    publicRelativePath: "worker/worker.min.js",
  },
  ...CORE_BASENAMES.map((basename) => ({
    sourcePackage: "tesseract.js-core",
    sourcePackagePath: basename,
    publicRelativePath: `core/${basename}`,
  })),
  {
    sourcePackage: "@tesseract.js-data/eng",
    sourcePackagePath: "4.0.0_best_int/eng.traineddata.gz",
    publicRelativePath: "lang/4.0.0_best_int/eng.traineddata.gz",
  },
  {
    sourcePackage: "@tesseract.js-data/chi_sim",
    sourcePackagePath: "4.0.0_best_int/chi_sim.traineddata.gz",
    publicRelativePath: "lang/4.0.0_best_int/chi_sim.traineddata.gz",
  },
]);

const sha256 = (content) => createHash("sha256").update(content).digest("hex");

function packageDirectory(rootDirectory, packageName) {
  return path.join(rootDirectory, "node_modules", ...packageName.split("/"));
}

function internalWorkspaceLink(rootDirectory) {
  return packageDirectory(rootDirectory, "@football-lottery-analysis-lab/ocr-core");
}

function internalWorkspaceTarget(rootDirectory) {
  return path.join(rootDirectory, "packages/ocr-core");
}

async function createDirectoryLink(targetDirectory, linkPath) {
  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(
    path.resolve(targetDirectory),
    linkPath,
    process.platform === "win32" ? "junction" : "dir",
  );
}

async function removeWorkerSource(rootDirectory) {
  await rm(path.join(packageDirectory(rootDirectory, "tesseract.js"), "dist/worker.min.js"));
}

function generatedOcrRoot(rootDirectory) {
  return path.join(rootDirectory, "apps/web/public/ocr/tesseract");
}

function syncCacheRoot(rootDirectory) {
  return path.join(rootDirectory, "node_modules/.cache");
}

async function snapshotRegularTree(rootDirectory) {
  const snapshot = {};

  async function visit(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const contents = await readFile(absolutePath);
        snapshot[relativePath] = {
          bytes: contents.byteLength,
          sha256: sha256(contents),
        };
      } else {
        snapshot[relativePath] = { unsupported: true };
      }
    }
  }

  await visit(rootDirectory, "");
  return snapshot;
}

async function listSyncCacheArtifacts(rootDirectory) {
  try {
    const entries = await readdir(syncCacheRoot(rootDirectory));
    return entries.filter((entry) => entry.startsWith("football-lab-ocr-")).sort();
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function expectOcrAssetRejection(callback, pattern) {
  await assert.rejects(callback, (error) => {
    assert.equal(error?.name, "OcrAssetValidationError");
    assert.match(error.message, pattern);
    return true;
  });
}

async function withObjectPrototypeValue(propertyName, value, callback) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, propertyName);
  Object.defineProperty(Object.prototype, propertyName, {
    configurable: true,
    enumerable: false,
    writable: true,
    value,
  });
  try {
    await callback();
  } finally {
    if (originalDescriptor === undefined) {
      delete Object.prototype[propertyName];
    } else {
      Object.defineProperty(Object.prototype, propertyName, originalDescriptor);
    }
  }
}

function sourceContent(definition) {
  return Buffer.from(`fixture:${definition.sourcePackage}:${definition.sourcePackagePath}\n`, "utf8");
}

function createManifest() {
  return {
    schemaVersion: "OCR_ASSET_MANIFEST_V1",
    tesseractVersion: "7.0.0",
    coreVersion: "7.0.0",
    languageDataVersion: "1.0.0/4.0.0_best_int",
    cachePath: "football-lab-ocr/tesseract-7.0.0/4.0.0_best_int",
    workerPath: "ocr/tesseract/7.0.0/worker/worker.min.js",
    corePath: "ocr/tesseract/7.0.0/core/",
    langPath: "ocr/tesseract/7.0.0/lang/4.0.0_best_int/",
    files: FILE_DEFINITIONS.map((definition) => {
      const content = sourceContent(definition);
      return {
        ...definition,
        bytes: content.byteLength,
        sha256: sha256(content),
      };
    }),
  };
}

function thirdPartyLicenseContent(component) {
  return Buffer.from(`Fixture license text for ${component.component}@${component.versionOrCommit}\n`, "utf8");
}

function createThirdPartyManifest() {
  return {
    schemaVersion: "THIRD_PARTY_OCR_MANIFEST_V1",
    components: THIRD_PARTY_COMPONENTS.map((component) => {
      const contents = thirdPartyLicenseContent(component);
      return {
        ...component,
        licenseBytes: contents.byteLength,
        licenseSha256: sha256(contents),
      };
    }),
  };
}

function createLockfile() {
  return {
    name: "ocr-assets-fixture",
    version: "0.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "ocr-assets-fixture",
        version: "0.0.0",
        workspaces: ["apps/*", "packages/*"],
      },
      "apps/web": {
        name: "@football-lottery-analysis-lab/web",
        version: "0.1.0",
        dependencies: {
          "@football-lottery-analysis-lab/ocr-core": "0.1.0",
          ...PUBLIC_PACKAGES,
        },
      },
      "packages/ocr-core": {
        name: "@football-lottery-analysis-lab/ocr-core",
        version: "0.1.0",
      },
      "node_modules/@football-lottery-analysis-lab/ocr-core": {
        resolved: "packages/ocr-core",
        link: true,
      },
      ...Object.fromEntries(
        Object.entries(PUBLIC_PACKAGES).map(([packageName, version]) => [
          `node_modules/${packageName}`,
          { version },
        ]),
      ),
    },
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createFixture({ withTargets = true } = {}) {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), "ocr-assets-check-"));
  const manifest = createManifest();

  await writeJson(path.join(rootDirectory, "package-lock.json"), createLockfile());
  await writeJson(path.join(rootDirectory, "apps/web/package.json"), {
    name: "@football-lottery-analysis-lab/web",
    version: "0.1.0",
    private: true,
    dependencies: {
      "@football-lottery-analysis-lab/ocr-core": "0.1.0",
      ...PUBLIC_PACKAGES,
    },
  });
  await writeJson(path.join(rootDirectory, "packages/ocr-core/package.json"), {
    name: "@football-lottery-analysis-lab/ocr-core",
    version: "0.1.0",
  });
  await createDirectoryLink(
    internalWorkspaceTarget(rootDirectory),
    internalWorkspaceLink(rootDirectory),
  );

  for (const [packageName, version] of Object.entries(PUBLIC_PACKAGES)) {
    const directory = packageDirectory(rootDirectory, packageName);
    const isLanguagePackage = packageName.startsWith("@tesseract.js-data/");
    await writeJson(path.join(directory, "package.json"), {
      name: packageName,
      version,
      license: isLanguagePackage ? "MIT" : "Apache-2.0",
    });
    if (!isLanguagePackage) {
      const licenseFileName = packageName === "tesseract.js" ? "LICENSE.md" : "LICENSE";
      await writeFile(
        path.join(directory, licenseFileName),
        `License fixture for ${packageName}\n`,
        "utf8",
      );
    }
  }

  for (const definition of FILE_DEFINITIONS) {
    const content = sourceContent(definition);
    const sourcePath = path.join(
      packageDirectory(rootDirectory, definition.sourcePackage),
      ...definition.sourcePackagePath.split("/"),
    );
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, content);

    if (withTargets) {
      const targetPath = path.join(
        rootDirectory,
        "apps/web/public/ocr/tesseract/7.0.0",
        ...definition.publicRelativePath.split("/"),
      );
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content);
    }
  }

  await writeJson(path.join(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json"), manifest);
  const thirdPartyManifest = createThirdPartyManifest();
  await writeJson(path.join(rootDirectory, "third_party/ocr/manifest.json"), thirdPartyManifest);
  for (const component of THIRD_PARTY_COMPONENTS) {
    const licensePath = path.join(rootDirectory, ...component.licensePath.split("/"));
    await mkdir(path.dirname(licensePath), { recursive: true });
    await writeFile(licensePath, thirdPartyLicenseContent(component));
  }
  await writeFile(
    path.join(rootDirectory, "NOTICE"),
    [
      "OCR runtime and embedded components",
      ...THIRD_PARTY_NOTICE_MARKERS,
      "See docs/third-party-ocr.md and third_party/ocr/manifest.json.",
      "",
    ].join("\n"),
    "utf8",
  );
  await mkdir(path.join(rootDirectory, "docs"), { recursive: true });
  await writeFile(
    path.join(rootDirectory, "docs/third-party-ocr.md"),
    "# Third-party OCR audit\n\nFixture documentation.\n",
    "utf8",
  );
  return rootDirectory;
}

async function mutateJson(rootDirectory, relativePath, mutate) {
  const absolutePath = path.join(rootDirectory, ...relativePath.split("/"));
  const value = JSON.parse(await readFile(absolutePath, "utf8"));
  await mutate(value);
  await writeJson(absolutePath, value);
}

async function withFixture(callback, options) {
  const rootDirectory = await createFixture(options);
  try {
    await callback(rootDirectory);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
}

async function expectRejected(callback, pattern) {
  await assert.rejects(callback, pattern);
}

let checker;
let synchronizer;
let loadFailure;

try {
  checker = await import(`${pathToFileURL(path.resolve(SCRIPT_DIRECTORY, "ocr-assets-check.mjs")).href}?spec=${Date.now()}`);
  synchronizer = await import(`${pathToFileURL(path.resolve(SCRIPT_DIRECTORY, "sync-ocr-assets.mjs")).href}?spec=${Date.now()}`);
} catch (error) {
  loadFailure = error;
}

if (loadFailure) {
  test("OCR asset checker and synchronizer implementations exist", () => {
    assert.fail(`Task 5 implementation is missing: ${loadFailure.message}`);
  });
} else {
  test("accepts an exact 21-file fixture backed by a real OCR Core workspace link", async () => {
    await withFixture(async (rootDirectory) => {
      assert.equal((await lstat(internalWorkspaceLink(rootDirectory))).isSymbolicLink(), true);
      assert.equal(
        await realpath(internalWorkspaceLink(rootDirectory)),
        await realpath(internalWorkspaceTarget(rootDirectory)),
      );
      const result = await checker.checkOcrAssets({ rootDirectory });
      assert.equal(result.fileCount, 21);
      assert.equal(result.licenseCount, 13);
    });
  });

  test("rejects a missing third-party OCR manifest", async () => {
    await withFixture(async (rootDirectory) => {
      await rm(path.join(rootDirectory, "third_party/ocr/manifest.json"));
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /third-party OCR manifest.*missing|manifest\.json.*missing/i,
      );
    });
  });

  for (const [description, component] of [
    ["direct package row", "tesseract.js"],
    ["native component row", "leptonica"],
  ]) {
    test(`rejects a missing ${description}`, async () => {
      await withFixture(async (rootDirectory) => {
        await mutateJson(rootDirectory, "third_party/ocr/manifest.json", (manifestValue) => {
          manifestValue.components = manifestValue.components.filter((row) => row.component !== component);
        });
        await expectOcrAssetRejection(
          () => checker.checkOcrAssets({ rootDirectory }),
          /third-party.*(?:13|inventory|missing|component)/i,
        );
      });
    });
  }

  test("rejects an extra third-party component row", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "third_party/ocr/manifest.json", (manifestValue) => {
        manifestValue.components.push({
          ...manifestValue.components.at(-1),
          component: "unexpected-native-component",
          licensePath: "third_party/ocr/licenses/unexpected.txt",
        });
      });
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /third-party.*(?:13|extra|inventory|component)/i,
      );
    });
  });

  for (const [description, mutate] of [
    ["duplicate component", (manifestValue) => { manifestValue.components[1].component = manifestValue.components[0].component; }],
    ["duplicate license path", (manifestValue) => { manifestValue.components[1].licensePath = manifestValue.components[0].licensePath; }],
  ]) {
    test(`rejects a ${description}`, async () => {
      await withFixture(async (rootDirectory) => {
        await mutateJson(rootDirectory, "third_party/ocr/manifest.json", mutate);
        await expectOcrAssetRejection(
          () => checker.checkOcrAssets({ rootDirectory }),
          /duplicate|exact inventory|approved component/i,
        );
      });
    });
  }

  for (const [description, component, invalidVersion] of [
    ["wrong direct package version", "tesseract.js", "42eae669e4b3a66429d8516f078912cc747a89df"],
    ["non-commit native version", "leptonica", "1.84.1"],
  ]) {
    test(`rejects a ${description}`, async () => {
      await withFixture(async (rootDirectory) => {
        await mutateJson(rootDirectory, "third_party/ocr/manifest.json", (manifestValue) => {
          manifestValue.components.find((row) => row.component === component).versionOrCommit = invalidVersion;
        });
        await expectOcrAssetRejection(
          () => checker.checkOcrAssets({ rootDirectory }),
          /versionOrCommit|exact.*(?:version|commit)|approved component/i,
        );
      });
    });
  }

  for (const [field, invalidValue] of [
    ["spdxIdentifier", "MIT"],
    ["sourceUrl", "http://example.test/not-official"],
    ["repositoryLicensePath", "NOT-A-LICENSE"],
  ]) {
    test(`rejects a wrong third-party ${field}`, async () => {
      await withFixture(async (rootDirectory) => {
        await mutateJson(rootDirectory, "third_party/ocr/manifest.json", (manifestValue) => {
          manifestValue.components[0][field] = invalidValue;
        });
        await expectOcrAssetRejection(
          () => checker.checkOcrAssets({ rootDirectory }),
          new RegExp(`${field}|approved component|exact inventory`, "i"),
        );
      });
    });
  }

  test("rejects a missing third-party license file", async () => {
    await withFixture(async (rootDirectory) => {
      const licensePath = THIRD_PARTY_COMPONENTS[0].licensePath;
      await rm(path.join(rootDirectory, ...licensePath.split("/")));
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /third-party.*license.*missing|license.*ENOENT/i,
      );
    });
  });

  test("rejects a tampered third-party license file", async () => {
    await withFixture(async (rootDirectory) => {
      const absolutePath = path.join(rootDirectory, ...THIRD_PARTY_COMPONENTS[0].licensePath.split("/"));
      const contents = Buffer.from(await readFile(absolutePath));
      contents[0] ^= 0xff;
      await writeFile(absolutePath, contents);
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /third-party.*license.*sha256 mismatch/i,
      );
    });
  });

  test("rejects an empty third-party license file", async () => {
    await withFixture(async (rootDirectory) => {
      const absolutePath = path.join(rootDirectory, ...THIRD_PARTY_COMPONENTS[0].licensePath.split("/"));
      await writeFile(absolutePath, "", "utf8");
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /third-party.*license.*(?:empty|positive|nonempty)/i,
      );
    });
  });

  for (const [field, invalidValue] of [
    ["licenseBytes", 1],
    ["licenseSha256", "0".repeat(64)],
  ]) {
    test(`rejects a third-party license ${field} mismatch`, async () => {
      await withFixture(async (rootDirectory) => {
        await mutateJson(rootDirectory, "third_party/ocr/manifest.json", (manifestValue) => {
          manifestValue.components[0][field] = invalidValue;
        });
        await expectOcrAssetRejection(
          () => checker.checkOcrAssets({ rootDirectory }),
          new RegExp(`${field.replace("license", "")}|${field}|mismatch`, "i"),
        );
      });
    });
  }

  for (const [description, marker] of [
    ["component marker", THIRD_PARTY_NOTICE_MARKERS[0]],
    ["documentation link", "docs/third-party-ocr.md"],
    ["manifest link", "third_party/ocr/manifest.json"],
  ]) {
    test(`rejects a NOTICE missing its OCR ${description}`, async () => {
      await withFixture(async (rootDirectory) => {
        const noticePath = path.join(rootDirectory, "NOTICE");
        const notice = await readFile(noticePath, "utf8");
        await writeFile(noticePath, notice.replace(marker, "removed-marker"), "utf8");
        await expectOcrAssetRejection(
          () => checker.checkOcrAssets({ rootDirectory }),
          /NOTICE.*(?:component|marker|docs\/third-party-ocr\.md|third_party\/ocr\/manifest\.json)/i,
        );
      });
    });
  }

  for (const [description, contents] of [
    ["missing", null],
    ["empty", "   \n"],
  ]) {
    test(`rejects a ${description} third-party OCR document`, async () => {
      await withFixture(async (rootDirectory) => {
        const documentPath = path.join(rootDirectory, "docs/third-party-ocr.md");
        if (contents === null) {
          await rm(documentPath);
        } else {
          await writeFile(documentPath, contents, "utf8");
        }
        await expectOcrAssetRejection(
          () => checker.checkOcrAssets({ rootDirectory }),
          /third-party OCR document.*(?:missing|empty|nonempty)/i,
        );
      });
    });
  }

  test("rejects an escaping third-party license path", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "third_party/ocr/manifest.json", (manifestValue) => {
        manifestValue.components[0].licensePath = "third_party/ocr/licenses/../../outside.txt";
      });
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /licensePath.*(?:escape|dot|canonical|third_party\/ocr\/licenses)/i,
      );
    });
  });

  test("rejects a symlink or junction in the third-party license path", async () => {
    await withFixture(async (rootDirectory) => {
      const licensesDirectory = path.join(rootDirectory, "third_party/ocr/licenses");
      const outsideDirectory = path.join(rootDirectory, "outside-licenses");
      await mkdir(outsideDirectory);
      for (const component of THIRD_PARTY_COMPONENTS) {
        await writeFile(
          path.join(outsideDirectory, path.basename(component.licensePath)),
          thirdPartyLicenseContent(component),
        );
      }
      await rm(licensesDirectory, { recursive: true });
      await createDirectoryLink(outsideDirectory, licensesDirectory);
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /third-party.*license.*(?:symlink|junction|reparse|link)/i,
      );
    });
  });

  test("rejects a missing relaxed-SIMD core variant", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
        manifest.files = manifest.files.filter(
          (row) => row.sourcePackagePath !== "tesseract-core-relaxedsimd-lstm.wasm",
        );
      });
      await expectRejected(
        () => checker.checkOcrAssets({ rootDirectory }),
        /allowlist|21|relaxedsimd/i,
      );
    });
  });

  test("rejects an unmanifested generated target", async () => {
    await withFixture(async (rootDirectory) => {
      const extraPath = path.join(
        rootDirectory,
        "apps/web/public/ocr/tesseract/7.0.0/core/unmanifested.wasm",
      );
      await writeFile(extraPath, "extra", "utf8");
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /extra|unmanifested/i);
    });
  });

  test("rejects a changed generated byte", async () => {
    await withFixture(async (rootDirectory) => {
      const targetPath = path.join(
        rootDirectory,
        "apps/web/public/ocr/tesseract/7.0.0/worker/worker.min.js",
      );
      await writeFile(targetPath, "changed", "utf8");
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /bytes|sha256|worker/i);
    });
  });

  test("rejects a manifest row with wrong bytes", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
        manifest.files[0].bytes += 1;
      });
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /bytes/i);
    });
  });

  test("rejects a manifest row with wrong sha256", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
        manifest.files[0].sha256 = "0".repeat(64);
      });
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /sha256/i);
    });
  });

  test("rejects a wrong web direct version in package-lock", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "package-lock.json", (lockfile) => {
        lockfile.packages["apps/web"].dependencies["tesseract.js"] = "^7.0.0";
      });
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /package-lock|tesseract\.js|7\.0\.0/i);
    });
  });

  test("rejects an internal OCR workspace dependency that is not linked exactly", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "package-lock.json", (lockfile) => {
        lockfile.packages["node_modules/@football-lottery-analysis-lab/ocr-core"].link = false;
      });
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /workspace|ocr-core|link/i);
    });
  });

  test("rejects a missing installed OCR Core workspace link before public source checks", async () => {
    await withFixture(async (rootDirectory) => {
      await unlink(internalWorkspaceLink(rootDirectory));
      await removeWorkerSource(rootDirectory);
      await expectRejected(
        () => checker.checkOcrAssets({ rootDirectory }),
        /installed.*ocr core.*workspace link.*missing|workspace link.*lstat/i,
      );
    });
  });

  test("rejects an ordinary copied OCR Core directory before public source checks", async () => {
    await withFixture(async (rootDirectory) => {
      const linkPath = internalWorkspaceLink(rootDirectory);
      await unlink(linkPath);
      await writeJson(path.join(linkPath, "package.json"), {
        name: "@football-lottery-analysis-lab/ocr-core",
        version: "0.1.0",
      });
      await removeWorkerSource(rootDirectory);
      await expectRejected(
        () => checker.checkOcrAssets({ rootDirectory }),
        /installed.*ocr core.*must be.*(?:symlink|junction|workspace link)/i,
      );
    });
  });

  test("rejects an OCR Core workspace link outside the repository before public source checks", async () => {
    const externalTarget = await mkdtemp(path.join(tmpdir(), "ocr-core-external-"));
    try {
      await writeJson(path.join(externalTarget, "package.json"), {
        name: "@football-lottery-analysis-lab/ocr-core",
        version: "0.1.0",
      });
      await withFixture(async (rootDirectory) => {
        const linkPath = internalWorkspaceLink(rootDirectory);
        await unlink(linkPath);
        await createDirectoryLink(externalTarget, linkPath);
        await removeWorkerSource(rootDirectory);
        await expectRejected(
          () => checker.checkOcrAssets({ rootDirectory }),
          /installed.*ocr core.*(?:outside|repository|expected workspace target)/i,
        );
      });
    } finally {
      await rm(externalTarget, { recursive: true, force: true });
    }
  });

  test("rejects a misdirected in-repository OCR Core workspace link before public source checks", async () => {
    await withFixture(async (rootDirectory) => {
      const wrongTarget = path.join(rootDirectory, "packages/not-ocr-core");
      await writeJson(path.join(wrongTarget, "package.json"), {
        name: "@football-lottery-analysis-lab/ocr-core",
        version: "0.1.0",
      });
      const linkPath = internalWorkspaceLink(rootDirectory);
      await unlink(linkPath);
      await createDirectoryLink(wrongTarget, linkPath);
      await removeWorkerSource(rootDirectory);
      await expectRejected(
        () => checker.checkOcrAssets({ rootDirectory }),
        /installed.*ocr core.*expected workspace target/i,
      );
    });
  });

  test("rejects an aliased OCR Core workspace target before public source checks", async () => {
    await withFixture(async (rootDirectory) => {
      const aliasTarget = path.join(rootDirectory, "packages/ocr-core-alias");
      await createDirectoryLink(internalWorkspaceTarget(rootDirectory), aliasTarget);
      const linkPath = internalWorkspaceLink(rootDirectory);
      await unlink(linkPath);
      await createDirectoryLink(aliasTarget, linkPath);
      await removeWorkerSource(rootDirectory);
      await expectRejected(
        () => checker.checkOcrAssets({ rootDirectory }),
        /installed.*ocr core.*(?:direct|alias|expected workspace target)/i,
      );
    });
  });

  test("rejects a wrong installed OCR Core package name before public source checks", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "packages/ocr-core/package.json", (packageManifest) => {
        packageManifest.name = "@football-lottery-analysis-lab/not-ocr-core";
      });
      await removeWorkerSource(rootDirectory);
      await expectRejected(
        () => checker.checkOcrAssets({ rootDirectory }),
        /installed.*ocr core.*name.*@football-lottery-analysis-lab\/ocr-core/i,
      );
    });
  });

  test("rejects a wrong installed OCR Core package version before public source checks", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "packages/ocr-core/package.json", (packageManifest) => {
        packageManifest.version = "0.1.1";
      });
      await removeWorkerSource(rootDirectory);
      await expectRejected(
        () => checker.checkOcrAssets({ rootDirectory }),
        /installed.*ocr core.*version.*0\.1\.0/i,
      );
    });
  });

  test("rejects missing installed language data", async () => {
    await withFixture(async (rootDirectory) => {
      await rm(
        path.join(
          packageDirectory(rootDirectory, "@tesseract.js-data/chi_sim"),
          "4.0.0_best_int/chi_sim.traineddata.gz",
        ),
      );
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /chi_sim|missing|source/i);
    });
  });

  test("rejects an installed package with no license or notice file", async () => {
    await withFixture(async (rootDirectory) => {
      const packageRoot = packageDirectory(rootDirectory, "tesseract.js-core");
      await rm(path.join(packageRoot, "LICENSE"));
      await mutateJson(
        rootDirectory,
        "node_modules/tesseract.js-core/package.json",
        (packageManifest) => {
          delete packageManifest.license;
        },
      );
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /license|notice/i);
    });
  });

  for (const invalidRuntimePath of [
    "https://cdn.example/worker.min.js",
    "http://cdn.example/worker.min.js",
    "//cdn.example/worker.min.js",
    "ocr\\worker.min.js",
    "../worker.min.js",
    "ocr/../worker.min.js",
    "ocr/worker.min.js?cache=1",
    "ocr/worker.min.js#fragment",
    "ocr/%2e%2e/worker.min.js",
    "ocr/%2fworker.min.js",
  ]) {
    test(`rejects unsafe runtime path: ${invalidRuntimePath}`, async () => {
      await withFixture(async (rootDirectory) => {
        await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
          manifest.workerPath = invalidRuntimePath;
        });
        await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /same-origin|relative|path|workerPath/i);
      });
    });
  }

  for (const [field, invalidPath] of [
    ["sourcePackagePath", "../outside.js"],
    ["sourcePackagePath", "%2e%2e/outside.js"],
    ["sourcePackagePath", "https://cdn.example/source.js"],
    ["publicRelativePath", "../outside.js"],
    ["publicRelativePath", "%2e%2e/outside.js"],
    ["publicRelativePath", "//cdn.example/outside.js"],
    ["publicRelativePath", "core\\outside.js"],
  ]) {
    test(`rejects unsafe ${field}: ${invalidPath}`, async () => {
      await withFixture(async (rootDirectory) => {
        await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
          manifest.files[0][field] = invalidPath;
        });
        await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /allowlist|relative|path|escape/i);
      });
    });
  }

  test("rejects a junction in an installed source path", async () => {
    await withFixture(async (rootDirectory) => {
      const sourceDirectory = path.join(packageDirectory(rootDirectory, "tesseract.js"), "dist");
      const outsideDirectory = path.join(rootDirectory, "outside-source-directory");
      await mkdir(outsideDirectory);
      await writeFile(
        path.join(outsideDirectory, "worker.min.js"),
        sourceContent(FILE_DEFINITIONS[0]),
      );
      await rm(sourceDirectory, { recursive: true });
      await symlink(outsideDirectory, sourceDirectory, "junction");
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /symlink|junction|link/i);
    });
  });

  test("rejects a junction in a generated target path", async () => {
    await withFixture(async (rootDirectory) => {
      const targetDirectory = path.join(
        rootDirectory,
        "apps/web/public/ocr/tesseract/7.0.0/worker",
      );
      const outsideDirectory = path.join(rootDirectory, "outside-target-directory");
      await mkdir(outsideDirectory);
      await writeFile(
        path.join(outsideDirectory, "worker.min.js"),
        sourceContent(FILE_DEFINITIONS[0]),
      );
      await rm(targetDirectory, { recursive: true });
      await symlink(outsideDirectory, targetDirectory, "junction");
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /symlink|junction|link/i);
    });
  });

  test("rejects a junction in the generated target ancestry", async () => {
    await withFixture(async (rootDirectory) => {
      const targetRoot = path.join(rootDirectory, "apps/web/public/ocr/tesseract");
      const outsideDirectory = path.join(rootDirectory, "outside-target-directory");
      await mkdir(outsideDirectory);
      await rm(targetRoot, { recursive: true });
      await symlink(outsideDirectory, targetRoot, "junction");
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /symlink|junction|link/i);
    });
  });

  test("rejects duplicate manifest paths", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
        manifest.files[1].publicRelativePath = manifest.files[0].publicRelativePath;
      });
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /duplicate|allowlist/i);
    });
  });

  test("rejects extra manifest top-level keys", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
        manifest.unapprovedAuthority = true;
      });
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /key|schema|unapprovedAuthority/i);
    });
  });

  test("rejects missing manifest top-level keys", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
        delete manifest.cachePath;
      });
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /cachePath|key|schema/i);
    });
  });

  test("rejects extra manifest row keys", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
        manifest.files[0].url = "https://cdn.example/worker.min.js";
      });
      await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /key|row|url/i);
    });
  });

  for (const [description, mutate] of [
    ["non-string schema version", (manifest) => { manifest.schemaVersion = 1; }],
    ["non-array files", (manifest) => { manifest.files = {}; }],
    ["non-integer bytes", (manifest) => { manifest.files[0].bytes = 1.5; }],
    ["non-string sha256", (manifest) => { manifest.files[0].sha256 = 123; }],
  ]) {
    test(`rejects invalid manifest types: ${description}`, async () => {
      await withFixture(async (rootDirectory) => {
        await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", mutate);
        await expectRejected(() => checker.checkOcrAssets({ rootDirectory }), /type|integer|schema|files|sha256/i);
      });
    });
  }

  test("sync refuses changed installed bytes without rewriting the manifest", async () => {
    await withFixture(async (rootDirectory) => {
      const manifestPath = path.join(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json");
      const sourcePath = path.join(packageDirectory(rootDirectory, "tesseract.js"), "dist/worker.min.js");
      const manifestBefore = await readFile(manifestPath, "utf8");
      await writeFile(sourcePath, "tampered-source", "utf8");
      await expectRejected(() => synchronizer.syncOcrAssets({ rootDirectory }), /bytes|sha256|source/i);
      assert.equal(await readFile(manifestPath, "utf8"), manifestBefore);
    });
  });

  test("sync replaces only the generated directory and preserves an OCR sibling", async () => {
    await withFixture(async (rootDirectory) => {
      const siblingPath = path.join(rootDirectory, "apps/web/public/ocr/keep.txt");
      const extraTarget = path.join(
        rootDirectory,
        "apps/web/public/ocr/tesseract/7.0.0/core/old-extra.wasm",
      );
      await writeFile(siblingPath, "preserve", "utf8");
      await writeFile(extraTarget, "remove", "utf8");
      const result = await synchronizer.syncOcrAssets({ rootDirectory });
      assert.equal(result.fileCount, 21);
      assert.equal(await readFile(siblingPath, "utf8"), "preserve");
      await assert.rejects(() => readFile(extraTarget), /ENOENT/);
      await checker.checkOcrAssets({ rootDirectory });
    });
  });

  test("sync creates the missing apps/web/public/ocr parent from a clean checkout", async () => {
    await withFixture(async (rootDirectory) => {
      await rm(path.join(rootDirectory, "apps/web/public/ocr"), { recursive: true });

      const syncResult = await synchronizer.syncOcrAssets({ rootDirectory });
      assert.equal(syncResult.fileCount, 21);

      const checkResult = await checker.checkOcrAssets({ rootDirectory });
      assert.equal(checkResult.fileCount, 21);
      assert.deepEqual(await listSyncCacheArtifacts(rootDirectory), []);
    });
  });

  test("sync rejects a generated-directory junction without deleting outside content", async () => {
    await withFixture(async (rootDirectory) => {
      const targetRoot = path.join(rootDirectory, "apps/web/public/ocr/tesseract");
      const outsideDirectory = path.join(rootDirectory, "outside-preserved");
      const sentinelPath = path.join(outsideDirectory, "sentinel.txt");
      await mkdir(outsideDirectory);
      await writeFile(sentinelPath, "preserve", "utf8");
      await rm(targetRoot, { recursive: true });
      await symlink(outsideDirectory, targetRoot, "junction");
      await expectRejected(() => synchronizer.syncOcrAssets({ rootDirectory }), /symlink|junction|link/i);
      assert.equal(await readFile(sentinelPath, "utf8"), "preserve");
    });
  });

  test("sync rejects a junction below the generated root without deleting outside content", async () => {
    await withFixture(async (rootDirectory) => {
      const targetDirectory = path.join(
        rootDirectory,
        "apps/web/public/ocr/tesseract/7.0.0/worker",
      );
      const outsideDirectory = path.join(rootDirectory, "outside-nested-preserved");
      const sentinelPath = path.join(outsideDirectory, "sentinel.txt");
      await mkdir(outsideDirectory);
      await writeFile(sentinelPath, "preserve", "utf8");
      await rm(targetDirectory, { recursive: true });
      await symlink(outsideDirectory, targetDirectory, "junction");
      await expectRejected(() => synchronizer.syncOcrAssets({ rootDirectory }), /symlink|junction|link/i);
      assert.equal(await readFile(sentinelPath, "utf8"), "preserve");
    });
  });

  test("A: stale sync lock fails closed before touching the final tree", async () => {
    await withFixture(async (rootDirectory) => {
      const finalBefore = await snapshotRegularTree(generatedOcrRoot(rootDirectory));
      const lockPath = path.join(syncCacheRoot(rootDirectory), "football-lab-ocr-sync.lock");
      await mkdir(path.dirname(lockPath), { recursive: true });
      await writeFile(lockPath, "stale-lock", "utf8");

      await expectOcrAssetRejection(
        () => synchronizer.syncOcrAssets({ rootDirectory }),
        /LOCKED|stale.*fail.*closed/i,
      );

      assert.deepEqual(await snapshotRegularTree(generatedOcrRoot(rootDirectory)), finalBefore);
      assert.equal(await readFile(lockPath, "utf8"), "stale-lock");
    });
  });

  test("A: a lang junction inserted after worker copy cannot write outside staging", async () => {
    const outsideDirectory = await mkdtemp(path.join(tmpdir(), "ocr-sync-outside-"));
    try {
      const sentinelPath = path.join(outsideDirectory, "sentinel.txt");
      await writeFile(sentinelPath, "preserve", "utf8");
      await withFixture(async (rootDirectory) => {
        const finalBefore = await snapshotRegularTree(generatedOcrRoot(rootDirectory));
        await expectOcrAssetRejection(
          () => synchronizer.syncOcrAssets({
            rootDirectory,
            onProgress: async (event) => {
              if (event.phase !== "asset-copied" || event.index !== 0) {
                return;
              }
              const langDirectory = path.join(
                event.stagingRoot,
                "7.0.0/lang/4.0.0_best_int",
              );
              await rm(langDirectory, { recursive: true });
              await createDirectoryLink(outsideDirectory, langDirectory);
            },
          }),
          /symlink|junction|reparse|staging/i,
        );

        assert.deepEqual(await snapshotRegularTree(generatedOcrRoot(rootDirectory)), finalBefore);
        assert.deepEqual(await readdir(outsideDirectory), ["sentinel.txt"]);
        assert.equal(await readFile(sentinelPath, "utf8"), "preserve");
        assert.deepEqual(await listSyncCacheArtifacts(rootDirectory), []);
      });
    } finally {
      await rm(outsideDirectory, { recursive: true, force: true });
    }
  });

  test("A: a last-asset exclusive-create failure leaves the old final tree unchanged", async () => {
    await withFixture(async (rootDirectory) => {
      const finalBefore = await snapshotRegularTree(generatedOcrRoot(rootDirectory));
      await expectOcrAssetRejection(
        () => synchronizer.syncOcrAssets({
          rootDirectory,
          onProgress: async (event) => {
            if (event.phase === "before-asset-write" && event.index === 20) {
              await writeFile(event.targetPath, "collision", "utf8");
            }
          },
        }),
        /exclusive|exists|EEXIST|last asset|chi_sim/i,
      );

      assert.deepEqual(await snapshotRegularTree(generatedOcrRoot(rootDirectory)), finalBefore);
      assert.deepEqual(await listSyncCacheArtifacts(rootDirectory), []);
    });
  });

  test("A: a failure after backing up the old final restores it byte-for-byte", async () => {
    await withFixture(async (rootDirectory) => {
      const finalBefore = await snapshotRegularTree(generatedOcrRoot(rootDirectory));
      await expectOcrAssetRejection(
        () => synchronizer.syncOcrAssets({
          rootDirectory,
          onProgress: async (event) => {
            if (event.phase === "old-final-backed-up") {
              throw new Error("forced publish failure");
            }
          },
        }),
        /publish|restore|progress hook/i,
      );

      assert.deepEqual(await snapshotRegularTree(generatedOcrRoot(rootDirectory)), finalBefore);
      await checker.checkOcrAssets({ rootDirectory });
      assert.deepEqual(await listSyncCacheArtifacts(rootDirectory), []);
    });
  });

  test("A: failure without an old final leaves no final or run artifacts", async () => {
    await withFixture(async (rootDirectory) => {
      await rm(generatedOcrRoot(rootDirectory), { recursive: true });
      await expectOcrAssetRejection(
        () => synchronizer.syncOcrAssets({
          rootDirectory,
          onProgress: async (event) => {
            if (event.phase === "before-stage-publish") {
              throw new Error("forced no-final publish failure");
            }
          },
        }),
        /publish|progress hook/i,
      );

      await assert.rejects(() => lstat(generatedOcrRoot(rootDirectory)), /ENOENT/);
      assert.deepEqual(await listSyncCacheArtifacts(rootDirectory), []);
    });
  });

  test("A: two concurrent syncs yield one success and one stable LOCKED failure", async () => {
    await withFixture(async (rootDirectory) => {
      let releaseFirst;
      const firstMayContinue = new Promise((resolve) => {
        releaseFirst = resolve;
      });
      let reportFirstLocked;
      const firstLocked = new Promise((resolve) => {
        reportFirstLocked = resolve;
      });

      const firstSync = synchronizer.syncOcrAssets({
        rootDirectory,
        onProgress: async (event) => {
          if (event.phase === "lock-acquired") {
            reportFirstLocked();
            await firstMayContinue;
          }
        },
      });
      const lockHookObserved = await Promise.race([
        firstLocked.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
      ]);
      if (!lockHookObserved) {
        releaseFirst();
        await firstSync;
        assert.fail("sync did not expose the deterministic lock-acquired progress hook");
      }

      let secondError;
      try {
        await synchronizer.syncOcrAssets({ rootDirectory });
      } catch (error) {
        secondError = error;
      } finally {
        releaseFirst();
      }

      const firstResult = await firstSync;
      assert.equal(secondError?.name, "OcrAssetValidationError");
      assert.match(secondError.message, /LOCKED/i);
      assert.equal(firstResult.fileCount, 21);
      await checker.checkOcrAssets({ rootDirectory });
      assert.deepEqual(await listSyncCacheArtifacts(rootDirectory), []);
    });
  });

  test("A: importing the sync module has no filesystem side effects", async () => {
    await withFixture(async (rootDirectory) => {
      const finalBefore = await snapshotRegularTree(generatedOcrRoot(rootDirectory));
      const cacheBefore = await listSyncCacheArtifacts(rootDirectory);
      await import(`${SYNC_URL.href}?side-effect=${Date.now()}`);
      assert.deepEqual(await snapshotRegularTree(generatedOcrRoot(rootDirectory)), finalBefore);
      assert.deepEqual(await listSyncCacheArtifacts(rootDirectory), cacheBefore);
    });
  });

  test("B: accepts metadata-only MIT evidence for both installed language packages", async () => {
    await withFixture(async (rootDirectory) => {
      const result = await checker.checkOcrAssets({ rootDirectory });
      assert.equal(result.packageEvidence["@tesseract.js-data/eng"], "package.json#license");
      assert.equal(result.packageEvidence["@tesseract.js-data/chi_sim"], "package.json#license");
    });
  });

  for (const [description, invalidLicense] of [
    ["arbitrary SPDX-like expression", "MIT OR Apache-2.0"],
    ["non-SPDX text", "custom-license"],
    ["object value", { id: "Apache-2.0" }],
    ["empty value", ""],
    ["whitespace value", "   \t"],
    ["overlong value", `Apache-2.0${" ".repeat(80)}`],
  ]) {
    test(`B: rejects ${description} even when the fixed JS license file exists`, async () => {
      await withFixture(async (rootDirectory) => {
        await mutateJson(rootDirectory, "node_modules/tesseract.js/package.json", (packageManifest) => {
          packageManifest.license = invalidLicense;
        });
        await expectOcrAssetRejection(
          () => checker.checkOcrAssets({ rootDirectory }),
          /tesseract\.js.*license.*Apache-2\.0|license.*exact|license.*string|license.*length|license.*required|license.*empty|license.*whitespace/i,
        );
      });
    });
  }

  test("B: rejects a missing own JS license even when the fixed license file exists", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "node_modules/tesseract.js/package.json", (packageManifest) => {
        delete packageManifest.license;
      });
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /tesseract\.js.*own.*license|license.*required/i,
      );
    });
  });

  test("B: rejects Apache-2.0 metadata on the MIT English language package", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(
        rootDirectory,
        "node_modules/@tesseract.js-data/eng/package.json",
        (packageManifest) => {
          packageManifest.license = "Apache-2.0";
        },
      );
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /eng.*license.*MIT|license.*exact/i,
      );
    });
  });

  for (const [description, licenseContents] of [
    ["empty", ""],
    ["whitespace-only", " \r\n\t"],
  ]) {
    test(`B: rejects a ${description} fixed core license file despite valid metadata`, async () => {
      await withFixture(async (rootDirectory) => {
        await writeFile(
          path.join(packageDirectory(rootDirectory, "tesseract.js-core"), "LICENSE"),
          licenseContents,
          "utf8",
        );
        await expectOcrAssetRejection(
          () => checker.checkOcrAssets({ rootDirectory }),
          /tesseract\.js-core.*license.*(?:empty|whitespace|content)/i,
        );
      });
    });
  }

  test("B: rejects an oversized fixed JS license file before reading it", async () => {
    await withFixture(async (rootDirectory) => {
      await writeFile(
        path.join(packageDirectory(rootDirectory, "tesseract.js"), "LICENSE.md"),
        Buffer.alloc(129 * 1024, 0x41),
      );
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /tesseract\.js.*license.*(?:size|large|limit|128)/i,
      );
    });
  });

  test("B: rejects an alternate license filename instead of the fixed JS license path", async () => {
    await withFixture(async (rootDirectory) => {
      const packageRoot = packageDirectory(rootDirectory, "tesseract.js");
      await rm(path.join(packageRoot, "LICENSE.md"));
      await writeFile(path.join(packageRoot, "LICENSE"), "alternate", "utf8");
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /tesseract\.js.*LICENSE\.md|fixed license/i,
      );
    });
  });

  test("B: rejects a directory at the fixed JS license file path", async () => {
    await withFixture(async (rootDirectory) => {
      const licensePath = path.join(packageDirectory(rootDirectory, "tesseract.js"), "LICENSE.md");
      await rm(licensePath);
      await mkdir(licensePath);
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /tesseract\.js.*license.*regular file/i,
      );
    });
  });

  test("B: inherited license metadata cannot replace an own language license", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(
        rootDirectory,
        "node_modules/@tesseract.js-data/eng/package.json",
        (packageManifest) => {
          delete packageManifest.license;
        },
      );
      await withObjectPrototypeValue("license", "MIT", async () => {
        await expectOcrAssetRejection(
          () => checker.checkOcrAssets({ rootDirectory }),
          /eng.*own.*license|license.*required/i,
        );
      });
    });
  });

  for (const [field, inheritedValue, relativePath, expectedPattern] of [
    ["name", "tesseract.js", "node_modules/tesseract.js/package.json", /tesseract\.js.*own.*name|name.*required/i],
    ["version", "7.0.0", "node_modules/tesseract.js/package.json", /tesseract\.js.*own.*version|version.*required/i],
    ["link", true, "package-lock.json", /workspace.*own.*link|link.*required/i],
    ["resolved", "packages/ocr-core", "package-lock.json", /workspace.*own.*resolved|resolved.*required/i],
    ["lockfileVersion", 3, "package-lock.json", /own.*lockfileVersion|lockfileVersion.*required/i],
  ]) {
    test(`B: inherited ${field} cannot replace required own data`, async () => {
      await withFixture(async (rootDirectory) => {
        await mutateJson(rootDirectory, relativePath, (value) => {
          if (field === "link" || field === "resolved") {
            delete value.packages["node_modules/@football-lottery-analysis-lab/ocr-core"][field];
          } else {
            delete value[field];
          }
        });
        await withObjectPrototypeValue(field, inheritedValue, async () => {
          await expectOcrAssetRejection(
            () => checker.checkOcrAssets({ rootDirectory }),
            expectedPattern,
          );
        });
      });
    });
  }

  test("B: direct manifest validation rejects an accessor without invoking it", () => {
    const manifest = createManifest();
    let getterCalls = 0;
    Object.defineProperty(manifest, "schemaVersion", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return "OCR_ASSET_MANIFEST_V1";
      },
    });
    assert.throws(
      () => checker.validateOcrAssetManifest(manifest),
      (error) => error?.name === "OcrAssetValidationError" && /own data|accessor|schemaVersion/i.test(error.message),
    );
    assert.equal(getterCalls, 0);
  });

  test("B: direct manifest row validation rejects an accessor without invoking it", () => {
    const manifest = createManifest();
    let getterCalls = 0;
    Object.defineProperty(manifest.files[0], "bytes", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return sourceContent(FILE_DEFINITIONS[0]).byteLength;
      },
    });
    assert.throws(
      () => checker.validateOcrAssetManifest(manifest),
      (error) => error?.name === "OcrAssetValidationError" && /own data|accessor|bytes/i.test(error.message),
    );
    assert.equal(getterCalls, 0);
  });

  test("B: rejects a manifest with the first two approved rows swapped", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
        [manifest.files[0], manifest.files[1]] = [manifest.files[1], manifest.files[0]];
      });
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /manifest\.files\[0\].*approved order|allowlist.*order/i,
      );
    });
  });

  test("B: rejects a cyclically shifted manifest allowlist", async () => {
    await withFixture(async (rootDirectory) => {
      await mutateJson(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json", (manifest) => {
        manifest.files.push(manifest.files.shift());
      });
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /manifest\.files\[0\].*approved order|allowlist.*order/i,
      );
    });
  });

  test("B: same-length source tampering fails specifically on source sha256", async () => {
    await withFixture(async (rootDirectory) => {
      const sourcePath = path.join(packageDirectory(rootDirectory, "tesseract.js"), "dist/worker.min.js");
      const contents = Buffer.from(await readFile(sourcePath));
      contents[0] ^= 0xff;
      await writeFile(sourcePath, contents);
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /source tesseract\.js\/dist\/worker\.min\.js sha256 mismatch/i,
      );
    });
  });

  test("B: same-length target tampering fails specifically on target sha256", async () => {
    await withFixture(async (rootDirectory) => {
      const targetPath = path.join(generatedOcrRoot(rootDirectory), "7.0.0/worker/worker.min.js");
      const contents = Buffer.from(await readFile(targetPath));
      contents[0] ^= 0xff;
      await writeFile(targetPath, contents);
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /target worker\/worker\.min\.js sha256 mismatch/i,
      );
    });
  });

  test("C: rejects an oversized manifest before JSON parsing", { timeout: 5_000 }, async () => {
    await withFixture(async (rootDirectory) => {
      const manifestPath = path.join(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json");
      await writeFile(manifestPath, "{}", "utf8");
      await truncate(manifestPath, (128 * 1024) + 1);
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /OCR asset manifest.*size.*131072|manifest.*128.*KiB/i,
      );
    });
  });

  test("C: rejects an oversized lockfile before JSON parsing", { timeout: 5_000 }, async () => {
    await withFixture(async (rootDirectory) => {
      const lockfilePath = path.join(rootDirectory, "package-lock.json");
      await writeFile(lockfilePath, "{}", "utf8");
      await truncate(lockfilePath, (2 * 1024 * 1024) + 1);
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /package-lock\.json.*size.*2097152|lockfile.*2.*MiB/i,
      );
    });
  });

  test("C: rejects an oversized web package manifest before JSON parsing", { timeout: 5_000 }, async () => {
    await withFixture(async (rootDirectory) => {
      const packagePath = path.join(rootDirectory, "apps/web/package.json");
      await writeFile(packagePath, "{}", "utf8");
      await truncate(packagePath, (256 * 1024) + 1);
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /apps\/web\/package\.json.*size.*262144|package manifest.*256.*KiB/i,
      );
    });
  });

  test("C: rejects an oversized installed package manifest before JSON parsing", { timeout: 5_000 }, async () => {
    await withFixture(async (rootDirectory) => {
      const packagePath = path.join(packageDirectory(rootDirectory, "tesseract.js"), "package.json");
      await writeFile(packagePath, "{}", "utf8");
      await truncate(packagePath, (256 * 1024) + 1);
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /installed tesseract\.js package\.json.*size.*262144|package manifest.*256.*KiB/i,
      );
    });
  });

  test("C: rejects a non-regular manifest before attempting to read it", async () => {
    await withFixture(async (rootDirectory) => {
      const manifestPath = path.join(rootDirectory, "apps/web/src/ocr/ocr-asset-manifest.json");
      await rm(manifestPath);
      await mkdir(manifestPath);
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /OCR asset manifest.*regular file/i,
      );
    });
  });

  test("C: manifest validation rejects a single asset over the 8 MiB cap", () => {
    const manifest = createManifest();
    manifest.files[0].bytes = (8 * 1024 * 1024) + 1;
    assert.throws(
      () => checker.validateOcrAssetManifest(manifest),
      (error) => error?.name === "OcrAssetValidationError"
        && /asset.*(?:8 MiB|8388608|per-file).*limit/i.test(error.message),
    );
  });

  test("C: manifest validation rejects a total asset budget over 64 MiB", () => {
    const manifest = createManifest();
    for (const row of manifest.files) {
      row.bytes = 4 * 1024 * 1024;
    }
    assert.throws(
      () => checker.validateOcrAssetManifest(manifest),
      (error) => error?.name === "OcrAssetValidationError"
        && /total asset.*(?:64 MiB|67108864).*budget/i.test(error.message),
    );
  });

  test("C: sparse oversized source fails on size policy before hashing", { timeout: 5_000 }, async () => {
    await withFixture(async (rootDirectory) => {
      const sourcePath = path.join(packageDirectory(rootDirectory, "tesseract.js"), "dist/worker.min.js");
      await truncate(sourcePath, (8 * 1024 * 1024) + 1);
      const startedAt = Date.now();
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /source tesseract\.js\/dist\/worker\.min\.js.*(?:size limit|8 MiB|8388608)/i,
      );
      assert.ok(Date.now() - startedAt < 4_000);
    });
  });

  test("C: sparse oversized target fails on size policy before hashing", { timeout: 5_000 }, async () => {
    await withFixture(async (rootDirectory) => {
      const targetPath = path.join(generatedOcrRoot(rootDirectory), "7.0.0/worker/worker.min.js");
      await truncate(targetPath, (8 * 1024 * 1024) + 1);
      const startedAt = Date.now();
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /target worker\/worker\.min\.js.*(?:size limit|8 MiB|8388608)/i,
      );
      assert.ok(Date.now() - startedAt < 4_000);
    });
  });

  test("C: deep unexpected generated directories fail without recursive traversal", { timeout: 5_000 }, async () => {
    await withFixture(async (rootDirectory) => {
      let deepDirectory = generatedOcrRoot(rootDirectory);
      for (let depth = 0; depth < 40; depth += 1) {
        deepDirectory = path.join(deepDirectory, `deep-${depth}`);
      }
      await mkdir(deepDirectory, { recursive: true });
      await writeFile(path.join(deepDirectory, "extra.bin"), "extra", "utf8");
      const startedAt = Date.now();
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /unexpected generated directory|generated.*depth budget/i,
      );
      assert.ok(Date.now() - startedAt < 4_000);
    });
  });

  test("C: many extra generated entries fail immediately within the entry budget", { timeout: 5_000 }, async () => {
    await withFixture(async (rootDirectory) => {
      const coreDirectory = path.join(generatedOcrRoot(rootDirectory), "7.0.0/core");
      await Promise.all(
        Array.from({ length: 100 }, (_, index) => writeFile(
          path.join(coreDirectory, `extra-${index.toString().padStart(3, "0")}.bin`),
          "x",
          "utf8",
        )),
      );
      const startedAt = Date.now();
      await expectOcrAssetRejection(
        () => checker.checkOcrAssets({ rootDirectory }),
        /unexpected generated (?:file|entry)|generated.*entry budget/i,
      );
      assert.ok(Date.now() - startedAt < 4_000);
    });
  });
}
