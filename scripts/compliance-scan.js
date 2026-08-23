import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scannedExtensions = new Set([
  '.cjs', '.css', '.html', '.java', '.js', '.json', '.jsx', '.md', '.mjs',
  '.sql', '.ts', '.tsx', '.vue', '.yaml', '.yml',
]);
const imageExtensions = new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const blockedTerms = [
  '必中', '稳赚', '包中', '跟投', '代买', '出票', '充值', '提现', '回本', '加注', // blocked policy dictionary
  '实单推荐', '中奖保证', '收益承诺', // blocked policy dictionary
];
const blockedCapabilities = [
  '支付接口', '购彩闭环', '代购服务', '合买入口', '跟单社区', // blocked policy dictionary
  '官方数据爬虫', '官方彩票爬虫', '绕过验证码', '绕过反爬', // blocked policy dictionary
];
const safeContextMarkers = [
  'No ', 'no ', 'Do not', 'do not', 'must not', 'prohibited', 'forbidden',
  'blocked', 'Boundary', '不', '禁止', '不得', '不提供', '不实现', '不添加',
  '不构成', '高风险', '敏感词', '边界', '合规',
];

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//u, '');
}

function listRepositoryFiles(rootDirectory) {
  let output;
  try {
    output = execFileSync(
      'git',
      ['-C', rootDirectory, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 },
    );
  } catch {
    throw new Error('COMPLIANCE_GIT_ENUMERATION_FAILED');
  }
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(normalizePath)
    .sort();
}

function isSafeContext(line) {
  return safeContextMarkers.some((marker) => line.includes(marker));
}

function finding(policy, category, file, line = undefined) {
  return Object.freeze({
    policy,
    category,
    file,
    ...(line === undefined ? {} : { line }),
  });
}

function readFixtureTarget(rootDirectory) {
  const metadataPath = join(rootDirectory, 'assets', 'ocr-samples', 'fictional-golden.json');
  if (!existsSync(metadataPath)) return null;
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    return typeof metadata.targetPath === 'string' ? normalizePath(metadata.targetPath) : null;
  } catch {
    return null;
  }
}

function isRuntimeOcrSource(path) {
  return (
    path.startsWith('apps/web/src/ocr/')
    || path.startsWith('packages/ocr-core/src/')
  ) && !/\.(?:spec|test)\.[^.]+$/u.test(path);
}

function isV2WriteBoundary(path) {
  return path === 'apps/web/src/api/ocrWorkflow.ts'
    || /apps\/server\/src\/main\/java\/org\/footballlab\/ocr\/domain\/(?:OcrWorkflowCreateRequest|OcrCandidateParseRequest|OcrReviewDraftUpdateRequest)\.java$/u.test(path)
    || /apps\/server\/src\/main\/java\/org\/footballlab\/ocr\/controller\/Ocr(?:Workflow|ReviewDraft)Controller\.java$/u.test(path);
}

function scanTextFile(rootDirectory, path) {
  const content = readFileSync(resolve(rootDirectory, path), 'utf8');
  const lines = content.split(/\r?\n/u);
  const findings = [];
  for (const [index, line] of lines.entries()) {
    for (const term of [...blockedTerms, ...blockedCapabilities]) {
      if (line.includes(term) && !isSafeContext(line)) {
        findings.push(finding('PRODUCT_COMPLIANCE', 'HIGH_RISK_TERM', path, index + 1));
      }
    }
  }

  if (isRuntimeOcrSource(path) || path === 'apps/web/src/ocr/ocr-asset-manifest.json') {
    if (/https?:\/\/|\/\/[^\s"']*(?:cdn|unpkg|jsdelivr)/iu.test(content)) {
      findings.push(finding('OCR_RUNTIME', 'REMOTE_OCR_RESOURCE', path));
    }
  }

  if (isV2WriteBoundary(path)) {
    const policies = [
      ['SOURCE_IMAGE_DATA', /data\s*:\s*image\/|(?:image|sourceImage|screenshot)(?:Data|Base64)\b/iu],
      ['MULTIPART_IMAGE_WRITE', /MultipartFile|@RequestPart|multipart\/form-data|new\s+FormData\s*\(/u],
      ['RAW_OCR_WRITE_FIELD', /\brawText\b|\braw_text\b/u],
      ['ORIGINAL_FILENAME_WRITE_FIELD', /\bfileName\b|\bfilename\b/iu],
    ];
    for (const [category, pattern] of policies) {
      if (pattern.test(content)) findings.push(finding('OCR_V2_WRITE_BOUNDARY', category, path));
    }
  }
  return findings;
}

export function scanRepository(rootDirectory) {
  const root = resolve(rootDirectory);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error('COMPLIANCE_ROOT_INVALID');
  }
  const files = listRepositoryFiles(root);
  const findings = [];
  const allowedFixture = readFixtureTarget(root);
  for (const path of files) {
    const extension = extname(path).toLowerCase();
    if (
      imageExtensions.has(extension)
      && (path.startsWith('apps/web/public/ocr') || path.startsWith('assets/ocr'))
      && path !== allowedFixture
    ) {
      findings.push(finding('OCR_ASSET_MANIFEST', 'UNMANIFESTED_OCR_BINARY', path));
    }
    if (scannedExtensions.has(extension)) findings.push(...scanTextFile(root, path));
  }
  return Object.freeze({ files: Object.freeze(files), findings: Object.freeze(findings) });
}

function isDirectRun() {
  return typeof process.argv[1] === 'string'
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isDirectRun()) {
  try {
    const result = scanRepository(process.cwd());
    if (result.findings.length > 0) {
      process.stderr.write('Compliance scan failed.\n');
      for (const resultFinding of result.findings) {
        const location = resultFinding.line === undefined
          ? resultFinding.file
          : `${resultFinding.file}:${resultFinding.line}`;
        process.stderr.write(`- ${resultFinding.policy}/${resultFinding.category} ${location}\n`);
      }
      process.exitCode = 1;
    } else {
      process.stdout.write(`Compliance scan passed. Scanned ${result.files.length} files.\n`);
    }
  } catch (error) {
    const code = typeof error?.message === 'string' && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : 'COMPLIANCE_SCAN_FAILED';
    process.stderr.write(`Compliance scan failed: ${code}\n`);
    process.exitCode = 2;
  }
}
