import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();

const ignoredDirs = new Set([
  '.git',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  'target',
  'coverage',
  'playwright-report',
  'test-results'
]);

const scannedExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.vue',
  '.yaml',
  '.yml'
]);

const blockedTerms = [
  '\u5fc5\u4e2d',
  '\u7a33\u8d5a',
  '\u5305\u4e2d',
  '\u8ddf\u6295',
  '\u4ee3\u4e70',
  '\u51fa\u7968',
  '\u5145\u503c',
  '\u63d0\u73b0',
  '\u56de\u672c',
  '\u52a0\u6ce8',
  '\u5b9e\u5355\u63a8\u8350',
  '\u4e2d\u5956\u4fdd\u8bc1',
  '\u6536\u76ca\u627f\u8bfa'
];

const blockedCapabilities = [
  '\u652f\u4ed8\u63a5\u53e3',
  '\u8d2d\u5f69\u95ed\u73af',
  '\u4ee3\u8d2d\u670d\u52a1',
  '\u5408\u4e70\u5165\u53e3',
  '\u8ddf\u5355\u793e\u533a',
  '\u5b98\u65b9\u6570\u636e\u722c\u866b',
  '\u5b98\u65b9\u5f69\u7968\u722c\u866b',
  '\u7ed5\u8fc7\u9a8c\u8bc1\u7801',
  '\u7ed5\u8fc7\u53cd\u722c'
];

const safeContextMarkers = [
  'No ',
  'no ',
  'Do not',
  'do not',
  'must not',
  'prohibited',
  'forbidden',
  'blocked',
  'Boundary',
  '\u4e0d',
  '\u7981\u6b62',
  '\u4e0d\u5f97',
  '\u4e0d\u63d0\u4f9b',
  '\u4e0d\u5b9e\u73b0',
  '\u4e0d\u6dfb\u52a0',
  '\u4e0d\u6784\u6210',
  '\u9ad8\u98ce\u9669',
  '\u654f\u611f\u8bcd',
  '\u8fb9\u754c',
  '\u5408\u89c4'
];

function listFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...listFiles(fullPath));
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (scannedExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function isSafeContext(line) {
  return safeContextMarkers.some((marker) => line.includes(marker));
}

function scanFile(filePath) {
  const relativePath = relative(rootDir, filePath).replaceAll('\\', '/');
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const findings = [];

  lines.forEach((line, index) => {
    const allTerms = [...blockedTerms, ...blockedCapabilities];
    for (const term of allTerms) {
      if (line.includes(term) && !isSafeContext(line)) {
        findings.push({
          file: relativePath,
          line: index + 1,
          term,
          text: line.trim()
        });
      }
    }
  });

  return findings;
}

function main() {
  if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
    console.error(`Invalid repository root: ${rootDir}`);
    process.exit(2);
  }

  const files = listFiles(rootDir);
  const findings = files.flatMap(scanFile);

  if (findings.length > 0) {
    console.error('Compliance scan failed. Review the following high-risk terms or capabilities:');
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.line} contains "${finding.term}" -> ${finding.text}`);
    }
    process.exit(1);
  }

  console.log(`Compliance scan passed. Scanned ${files.length} files.`);
}

main();

