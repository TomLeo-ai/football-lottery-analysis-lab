import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertGeneratedRootSafe,
  checkOcrAssets,
  getOcrAssetPaths,
  OcrAssetValidationError,
  prepareOcrAssetSources,
  verifyOcrAssetTree,
} from "./ocr-assets-check.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "..");
const CACHE_RELATIVE_PATH = "node_modules/.cache";
const LOCK_NAME = "football-lab-ocr-sync.lock";
const RUN_DIRECTORY_PREFIX = "football-lab-ocr-run-";
const GENERATED_VERSION = "7.0.0";
const STAGING_DIRECTORIES = Object.freeze([
  GENERATED_VERSION,
  `${GENERATED_VERSION}/worker`,
  `${GENERATED_VERSION}/core`,
  `${GENERATED_VERSION}/lang`,
  `${GENERATED_VERSION}/lang/4.0.0_best_int`,
]);

function validationError(message, cause) {
  const error = new OcrAssetValidationError(message);
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

function errorCode(error) {
  return typeof error?.code === "string" ? error.code : "UNKNOWN";
}

function normalizeError(error, context) {
  if (error instanceof OcrAssetValidationError) {
    return error;
  }
  return validationError(`${context} failed: ${errorCode(error)}`, error);
}

function isContained(basePath, candidatePath, { allowEqual = false } = {}) {
  const absoluteBase = path.resolve(basePath);
  const absoluteCandidate = path.resolve(candidatePath);
  const relativePath = path.relative(absoluteBase, absoluteCandidate);
  if (relativePath === "") {
    return allowEqual;
  }
  return !(
    relativePath === ".."
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  );
}

function assertContained(basePath, candidatePath, label, options) {
  const absoluteCandidate = path.resolve(candidatePath);
  if (!isContained(basePath, absoluteCandidate, options)) {
    throw validationError(`${label} escapes its authorized directory`);
  }
  return absoluteCandidate;
}

async function lstatStructured(absolutePath, label, { allowMissing = false } = {}) {
  try {
    return await lstat(absolutePath);
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") {
      return undefined;
    }
    throw validationError(`${label} lstat failed: ${errorCode(error)}`, error);
  }
}

async function realpathStructured(absolutePath, label) {
  try {
    return await realpath(absolutePath);
  } catch (error) {
    throw validationError(`${label} realpath failed: ${errorCode(error)}`, error);
  }
}

async function assertDirectoryNoLink(absolutePath, label) {
  const status = await lstatStructured(absolutePath, label);
  if (status.isSymbolicLink()) {
    throw validationError(`${label} must not be a symlink, junction, or reparse point`);
  }
  if (!status.isDirectory()) {
    throw validationError(`${label} must be a directory`);
  }
}

async function assertAbsoluteDirectoryChain(absoluteDirectory, label) {
  const resolvedDirectory = path.resolve(absoluteDirectory);
  const parsedPath = path.parse(resolvedDirectory);
  const segments = resolvedDirectory.slice(parsedPath.root.length).split(path.sep).filter(Boolean);
  let cursor = parsedPath.root;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    await assertDirectoryNoLink(cursor, label);
  }
}

async function assertDirectoryChain(baseDirectory, targetDirectory, label) {
  const absoluteBase = path.resolve(baseDirectory);
  const absoluteTarget = assertContained(
    absoluteBase,
    targetDirectory,
    label,
    { allowEqual: true },
  );
  await assertDirectoryNoLink(absoluteBase, label);
  const baseRealPath = await realpathStructured(absoluteBase, label);
  const relativePath = path.relative(absoluteBase, absoluteTarget);
  let cursor = absoluteBase;
  for (const segment of relativePath.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    await assertDirectoryNoLink(cursor, label);
    const cursorRealPath = await realpathStructured(cursor, label);
    if (!isContained(baseRealPath, cursorRealPath, { allowEqual: true })) {
      throw validationError(`${label} resolves outside its authorized directory`);
    }
  }
}

async function assertPathMissing(absolutePath, label) {
  const status = await lstatStructured(absolutePath, label, { allowMissing: true });
  if (status !== undefined) {
    throw validationError(`${label} already exists; exclusive creation refused`);
  }
}

async function ensureCacheRoot(rootDirectory) {
  await assertAbsoluteDirectoryChain(rootDirectory, "repository root");
  const nodeModulesRoot = assertContained(
    rootDirectory,
    path.join(rootDirectory, "node_modules"),
    "node_modules root",
  );
  await assertDirectoryChain(rootDirectory, nodeModulesRoot, "node_modules root");

  const cacheRoot = assertContained(
    nodeModulesRoot,
    path.join(rootDirectory, ...CACHE_RELATIVE_PATH.split("/")),
    "OCR sync cache root",
  );
  const cacheStatus = await lstatStructured(cacheRoot, "OCR sync cache root", { allowMissing: true });
  if (cacheStatus === undefined) {
    try {
      await mkdir(cacheRoot);
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw validationError(`OCR sync cache creation failed: ${errorCode(error)}`, error);
      }
    }
  }
  await assertDirectoryChain(nodeModulesRoot, cacheRoot, "OCR sync cache root");
  return cacheRoot;
}

async function acquireSyncLock(cacheRoot) {
  const lockPath = assertContained(cacheRoot, path.join(cacheRoot, LOCK_NAME), "OCR sync lock");
  const token = randomUUID();
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw validationError("OCR asset sync is LOCKED; stale locks fail closed");
    }
    throw validationError(`OCR sync lock acquisition failed: ${errorCode(error)}`, error);
  }

  try {
    await handle.writeFile(token, "utf8");
    await handle.sync();
  } catch (error) {
    try {
      await handle.close();
      await unlink(lockPath);
    } catch {
      // The original structured acquisition error remains authoritative.
    }
    throw validationError(`OCR sync lock initialization failed: ${errorCode(error)}`, error);
  }
  return { handle, lockPath, token };
}

async function releaseSyncLock(lock) {
  try {
    await lock.handle.close();
  } catch (error) {
    throw validationError(`OCR sync lock close failed: ${errorCode(error)}`, error);
  }

  const status = await lstatStructured(lock.lockPath, "OCR sync lock");
  if (status.isSymbolicLink() || !status.isFile()) {
    throw validationError("OCR sync lock changed type; refusing to remove an unowned lock");
  }
  let storedToken;
  try {
    storedToken = await readFile(lock.lockPath, "utf8");
  } catch (error) {
    throw validationError(`OCR sync lock verification failed: ${errorCode(error)}`, error);
  }
  if (storedToken !== lock.token) {
    throw validationError("OCR sync lock token changed; refusing to remove an unowned lock");
  }
  try {
    await unlink(lock.lockPath);
  } catch (error) {
    throw validationError(`OCR sync lock release failed: ${errorCode(error)}`, error);
  }
}

async function emitProgress(onProgress, event) {
  if (onProgress === undefined) {
    return;
  }
  if (typeof onProgress !== "function") {
    throw validationError("sync onProgress must be a function when provided");
  }
  try {
    await onProgress(Object.freeze(event));
  } catch (error) {
    throw validationError(`sync progress hook failed during ${event.phase}`, error);
  }
}

async function createRunDirectory(cacheRoot) {
  let runRoot;
  try {
    runRoot = await mkdtemp(path.join(cacheRoot, RUN_DIRECTORY_PREFIX));
  } catch (error) {
    throw validationError(`OCR sync staging allocation failed: ${errorCode(error)}`, error);
  }
  assertContained(cacheRoot, runRoot, "OCR sync run directory");
  await assertDirectoryChain(cacheRoot, runRoot, "OCR sync run directory");
  return runRoot;
}

async function createStagingTree(runRoot) {
  const stagingRoot = assertContained(runRoot, path.join(runRoot, "stage"), "OCR staging root");
  try {
    await mkdir(stagingRoot);
    for (const relativeDirectory of STAGING_DIRECTORIES) {
      await mkdir(path.join(stagingRoot, ...relativeDirectory.split("/")));
    }
  } catch (error) {
    throw validationError(`OCR staging directory creation failed: ${errorCode(error)}`, error);
  }
  await assertDirectoryChain(runRoot, stagingRoot, "OCR staging root");
  for (const relativeDirectory of STAGING_DIRECTORIES) {
    await assertDirectoryChain(
      stagingRoot,
      path.join(stagingRoot, ...relativeDirectory.split("/")),
      `OCR staging directory ${relativeDirectory}`,
    );
  }
  return stagingRoot;
}

// Node does not expose an openat/O_NOFOLLOW equivalent on Windows, so no script can
// eliminate a malicious same-user replacement in the nanoseconds between checks.
// This sync therefore uses a private run directory plus repeated lstat/realpath and
// containment checks before and after each exclusive write to close reproducible
// junction races without claiming protection from that residual platform race.
async function writeStagedAsset(sourceRow, index, stagingRoot, onProgress) {
  const { row, sourcePath } = sourceRow;
  const versionRoot = path.join(stagingRoot, GENERATED_VERSION);
  const targetPath = assertContained(
    versionRoot,
    path.resolve(versionRoot, ...row.publicRelativePath.split("/")),
    `staging asset ${row.publicRelativePath}`,
  );
  const parentDirectory = path.dirname(targetPath);

  await assertDirectoryChain(stagingRoot, parentDirectory, `staging asset ${row.publicRelativePath}`);
  await assertPathMissing(targetPath, `staging asset ${row.publicRelativePath}`);
  await emitProgress(onProgress, {
    phase: "before-asset-write",
    index,
    row,
    stagingRoot,
    targetPath,
  });
  await assertDirectoryChain(stagingRoot, parentDirectory, `staging asset ${row.publicRelativePath}`);
  await assertPathMissing(targetPath, `staging asset ${row.publicRelativePath}`);

  let targetHandle;
  try {
    targetHandle = await open(targetPath, "wx", 0o600);
  } catch (error) {
    throw validationError(
      `exclusive staging create failed for asset ${row.publicRelativePath}: ${errorCode(error)}`,
      error,
    );
  }
  try {
    const contents = await readFile(sourcePath);
    await targetHandle.writeFile(contents);
    await targetHandle.sync();
  } catch (error) {
    throw validationError(`staging write failed for asset ${row.publicRelativePath}: ${errorCode(error)}`, error);
  } finally {
    try {
      await targetHandle.close();
    } catch {
      // The post-write lstat/verification below will reject an unusable target.
    }
  }

  await assertDirectoryChain(stagingRoot, parentDirectory, `staging asset ${row.publicRelativePath}`);
  const targetStatus = await lstatStructured(targetPath, `staging asset ${row.publicRelativePath}`);
  if (targetStatus.isSymbolicLink() || !targetStatus.isFile()) {
    throw validationError(`staging asset ${row.publicRelativePath} is not a regular file`);
  }
  const targetRealPath = await realpathStructured(targetPath, `staging asset ${row.publicRelativePath}`);
  if (!isContained(stagingRoot, targetRealPath)) {
    throw validationError(`staging asset ${row.publicRelativePath} resolves outside staging`);
  }
  await emitProgress(onProgress, {
    phase: "asset-copied",
    index,
    row,
    stagingRoot,
    targetPath,
  });
}

async function verifyStagingTree(prepared, stagingRoot) {
  try {
    await verifyOcrAssetTree(prepared, stagingRoot, { label: "OCR staging root" });
  } catch (error) {
    throw validationError(
      "staging verification failed: the exact asset tree, hashes, or link policy was rejected",
      error,
    );
  }
}

async function pathExists(absolutePath, label) {
  return (await lstatStructured(absolutePath, label, { allowMissing: true })) !== undefined;
}

async function ensurePublicOcrRoot(paths) {
  const expectedPublicRoot = assertContained(
    paths.rootDirectory,
    path.join(paths.rootDirectory, "apps", "web", "public"),
    "web public root",
  );
  const actualPublicRoot = path.dirname(paths.publicOcrRoot);
  if (path.resolve(actualPublicRoot) !== path.resolve(expectedPublicRoot)) {
    throw validationError("public OCR parent is not below the authorized apps/web/public directory");
  }

  // A clean checkout has apps/web/public but not its generated ocr child. Validate
  // every existing ancestor first and create only that one missing directory.
  await assertDirectoryChain(paths.rootDirectory, expectedPublicRoot, "web public root");
  const status = await lstatStructured(paths.publicOcrRoot, "public OCR root", {
    allowMissing: true,
  });
  if (status === undefined) {
    try {
      await mkdir(paths.publicOcrRoot);
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw validationError(`public OCR root creation failed: ${errorCode(error)}`, error);
      }
      // A concurrent creator won the mkdir race; the strict checks below remain
      // authoritative and reject a link, non-directory, or escaped realpath.
    }
  }

  await assertDirectoryChain(expectedPublicRoot, paths.publicOcrRoot, "public OCR root");
  const [repositoryRealPath, publicOcrRealPath] = await Promise.all([
    realpathStructured(paths.rootDirectory, "repository root"),
    realpathStructured(paths.publicOcrRoot, "public OCR root"),
  ]);
  if (!isContained(repositoryRealPath, publicOcrRealPath)) {
    throw validationError("public OCR root resolves outside the repository root");
  }
}

async function renameStructured(sourcePath, targetPath, label) {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    throw validationError(`${label} rename failed: ${errorCode(error)}`, error);
  }
}

async function removeOwnedTree(rootPath, ownerRoot, label) {
  const absoluteRoot = assertContained(ownerRoot, rootPath, label);
  const rootStatus = await lstatStructured(absoluteRoot, label, { allowMissing: true });
  if (rootStatus === undefined) {
    return;
  }

  const stack = [{ entryPath: absoluteRoot, visited: false }];
  while (stack.length > 0) {
    const current = stack.pop();
    const status = await lstatStructured(current.entryPath, label, { allowMissing: true });
    if (status === undefined) {
      continue;
    }
    if (status.isSymbolicLink() || !status.isDirectory()) {
      try {
        await unlink(current.entryPath);
      } catch (error) {
        throw validationError(`${label} cleanup failed: ${errorCode(error)}`, error);
      }
      continue;
    }
    if (current.visited) {
      try {
        await rmdir(current.entryPath);
      } catch (error) {
        throw validationError(`${label} cleanup failed: ${errorCode(error)}`, error);
      }
      continue;
    }
    stack.push({ entryPath: current.entryPath, visited: true });
    let entries;
    try {
      entries = await readdir(current.entryPath);
    } catch (error) {
      throw validationError(`${label} cleanup enumeration failed: ${errorCode(error)}`, error);
    }
    for (const entryName of entries) {
      const entryPath = assertContained(absoluteRoot, path.join(current.entryPath, entryName), label);
      stack.push({ entryPath, visited: false });
    }
  }
}

async function restoreAfterPublishFailure({
  prepared,
  runRoot,
  backupPath,
  failedPath,
  oldBackedUp,
  stagePublished,
}) {
  if (stagePublished) {
    await assertPathMissing(failedPath, "failed staged tree quarantine");
    await renameStructured(
      prepared.paths.generatedRoot,
      failedPath,
      "failed staged tree quarantine",
    );
  }
  if (oldBackedUp) {
    await assertDirectoryChain(
      prepared.paths.rootDirectory,
      prepared.paths.publicOcrRoot,
      "final OCR parent",
    );
    await renameStructured(
      backupPath,
      prepared.paths.generatedRoot,
      "old final restoration",
    );
  }
  if (!oldBackedUp && !stagePublished) {
    const unexpectedFinal = await pathExists(prepared.paths.generatedRoot, "unexpected final tree");
    if (unexpectedFinal) {
      throw validationError("publish rollback found an unexpected final tree");
    }
  }
  await removeOwnedTree(failedPath, runRoot, "failed staged tree cleanup");
}

async function publishStagingTree(prepared, stagingRoot, runRoot, onProgress) {
  const backupPath = assertContained(runRoot, path.join(runRoot, "backup"), "OCR final backup");
  const failedPath = assertContained(runRoot, path.join(runRoot, "failed"), "failed staged tree");
  let oldBackedUp = false;
  let stagePublished = false;

  await verifyStagingTree(prepared, stagingRoot);
  await ensurePublicOcrRoot(prepared.paths);
  await assertGeneratedRootSafe(prepared.paths);
  await assertDirectoryChain(
    prepared.paths.rootDirectory,
    prepared.paths.publicOcrRoot,
    "final OCR parent",
  );
  await assertPathMissing(backupPath, "OCR final backup");
  await assertPathMissing(failedPath, "failed staged tree");
  await emitProgress(onProgress, {
    phase: "before-stage-publish",
    stagingRoot,
    finalRoot: prepared.paths.generatedRoot,
  });
  await verifyStagingTree(prepared, stagingRoot);
  await assertGeneratedRootSafe(prepared.paths);
  await assertDirectoryChain(
    prepared.paths.rootDirectory,
    prepared.paths.publicOcrRoot,
    "final OCR parent",
  );

  const hadOldFinal = await pathExists(prepared.paths.generatedRoot, "existing final OCR tree");
  try {
    if (hadOldFinal) {
      await renameStructured(prepared.paths.generatedRoot, backupPath, "old final backup");
      oldBackedUp = true;
      await emitProgress(onProgress, {
        phase: "old-final-backed-up",
        stagingRoot,
        finalRoot: prepared.paths.generatedRoot,
      });
    }

    await assertDirectoryChain(
      prepared.paths.rootDirectory,
      prepared.paths.publicOcrRoot,
      "final OCR parent",
    );
    await verifyStagingTree(prepared, stagingRoot);
    await renameStructured(stagingRoot, prepared.paths.generatedRoot, "staged final publish");
    stagePublished = true;
    await emitProgress(onProgress, {
      phase: "final-published",
      finalRoot: prepared.paths.generatedRoot,
    });
    const result = await checkOcrAssets({ rootDirectory: prepared.paths.rootDirectory });

    if (oldBackedUp) {
      await removeOwnedTree(backupPath, runRoot, "old final backup cleanup");
      oldBackedUp = false;
    }
    return result;
  } catch (error) {
    const publishError = normalizeError(error, "OCR asset publish");
    try {
      await restoreAfterPublishFailure({
        prepared,
        runRoot,
        backupPath,
        failedPath,
        oldBackedUp,
        stagePublished,
      });
      oldBackedUp = false;
      stagePublished = false;
    } catch (rollbackError) {
      throw validationError(
        `OCR asset publish failed and old final restoration failed: ${errorCode(rollbackError)}`,
        { publishError, rollbackError },
      );
    }
    throw publishError;
  }
}

export async function syncOcrAssets({
  rootDirectory = DEFAULT_ROOT_DIRECTORY,
  onProgress,
} = {}) {
  const absoluteRoot = path.resolve(rootDirectory);
  let lock;
  let runRoot;
  let result;
  let operationError;

  try {
    const paths = getOcrAssetPaths(absoluteRoot);
    const cacheRoot = await ensureCacheRoot(paths.rootDirectory);
    lock = await acquireSyncLock(cacheRoot);
    await emitProgress(onProgress, { phase: "lock-acquired" });

    const prepared = await prepareOcrAssetSources({ rootDirectory: paths.rootDirectory });
    runRoot = await createRunDirectory(cacheRoot);
    const stagingRoot = await createStagingTree(runRoot);
    for (let index = 0; index < prepared.sourceRows.length; index += 1) {
      await writeStagedAsset(prepared.sourceRows[index], index, stagingRoot, onProgress);
    }
    await verifyStagingTree(prepared, stagingRoot);
    await emitProgress(onProgress, { phase: "staging-verified", stagingRoot });
    result = await publishStagingTree(prepared, stagingRoot, runRoot, onProgress);
  } catch (error) {
    operationError = normalizeError(error, "OCR asset sync");
  }

  let cleanupError;
  if (runRoot !== undefined) {
    try {
      const cacheRoot = path.dirname(runRoot);
      await removeOwnedTree(runRoot, cacheRoot, "OCR sync run cleanup");
    } catch (error) {
      cleanupError = normalizeError(error, "OCR sync run cleanup");
    }
  }
  if (lock !== undefined) {
    try {
      await releaseSyncLock(lock);
    } catch (error) {
      cleanupError ??= normalizeError(error, "OCR sync lock cleanup");
    }
  }

  if (operationError !== undefined) {
    if (cleanupError !== undefined) {
      throw validationError(
        `${operationError.message}; cleanup also failed: ${cleanupError.message}`,
        { operationError, cleanupError },
      );
    }
    throw operationError;
  }
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
  return result;
}

function isDirectExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    const result = await syncOcrAssets();
    console.log(`OCR asset sync passed: ${result.fileCount} files, ${result.totalBytes} bytes.`);
  } catch (error) {
    console.error(`[sync-ocr-assets] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
