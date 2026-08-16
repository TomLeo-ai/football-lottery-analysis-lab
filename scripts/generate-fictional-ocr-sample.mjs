import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const generatorPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(generatorPath), '..');
const sourceRelativePath = 'assets/ocr-samples/fictional-golden.html';
const metadataRelativePath = 'assets/ocr-samples/fictional-golden.json';
const targetRelativePath = 'apps/web/public/ocr-samples/fictional-golden.png';
const sourcePath = join(repoRoot, sourceRelativePath);
const metadataPath = join(repoRoot, metadataRelativePath);
const targetPath = join(repoRoot, targetRelativePath);
const expectedWidth = 1440;
const expectedHeight = 1000;
const expectedBytesLimit = 1024 * 1024;
const maxDecodedPngBytes = 16 * 1024 * 1024;
const expectedMetadataKeys = [
  'schemaVersion', 'rights', 'containsThirdPartyMarks', 'stableTokens', 'rawOnlySentinel',
  'sourcePath', 'generatorPath', 'targetPath', 'sourceSha256', 'generatorSha256',
  'width', 'height', 'bytes', 'sha256',
];
const expectedMetadata = {
  schemaVersion: 'OCR_FIXTURE_V1',
  rights: 'PROJECT_GENERATED_FICTIONAL_SAMPLE',
  containsThirdPartyMarks: false,
  stableTokens: ['DEMO DATA', '演示联赛', 'Blue Harbor', '红枫城'],
  rawOnlySentinel: 'OCR_RAW_ONLY_SENTINEL_V2_9F3A',
  sourcePath: sourceRelativePath,
  generatorPath: 'scripts/generate-fictional-ocr-sample.mjs',
  targetPath: targetRelativePath,
};
const approvedVisibleLabels = ['MATCH REF', 'MARKET REF', 'DATE', 'LEAGUE', 'HOME', 'AWAY', 'KICKOFF', 'PLAY TYPE', 'SELECTION', 'ODDS'];
const expectedMatches = [
  { token: 'DEMO-MATCH-A', rows: { 'MATCH REF': 'DEMO-MATCH-A', 'MARKET REF': 'DEMO-MATCH-A', DATE: '2030-04-01', LEAGUE: '演示联赛', HOME: 'Blue Harbor', AWAY: '青石湾队', KICKOFF: '2030-04-01 19:30 +08:00', 'PLAY TYPE': 'WIN_DRAW_LOSS', SELECTION: 'HOME_WIN', ODDS: '2.15' } },
  { token: 'DEMO-MATCH-B', rows: { 'MATCH REF': 'DEMO-MATCH-B', 'MARKET REF': 'DEMO-MATCH-B', DATE: '2030-04-02', LEAGUE: '演示联赛', HOME: '红枫城', AWAY: '星河谷队', KICKOFF: '2030-04-02 20:00 +08:00', 'PLAY TYPE': 'WIN_DRAW_LOSS', SELECTION: 'DRAW', ODDS: '3.40' } },
];
const resourceNodeSelector = 'script,img,svg,link,base,iframe,object,embed,video,audio,source,canvas,template';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? ((value >>> 1) ^ 0xedb88320) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(typeBytes, dataBytes) {
  let value = 0xffffffff;
  for (const byte of typeBytes) value = (crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)) >>> 0;
  for (const byte of dataBytes) value = (crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)) >>> 0;
  return (value ^ 0xffffffff) >>> 0;
}

function parsePng(bytes) {
  const errors = [];
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < signature.length || !signature.every((value, index) => bytes[index] === value)) return { errors: ['png.signature: invalid PNG signature'] };
  let offset = signature.length;
  let sawIHDR = false;
  let sawIDAT = false;
  let sawIEND = false;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let compressionMethod;
  let filterMethod;
  let interlaceMethod;
  const idatParts = [];
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) { errors.push('png.structure: truncated chunk header'); break; }
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    if (length > bytes.length - dataStart - 4) { errors.push('png.length: chunk length exceeds remaining bytes'); break; }
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    const typeBytes = bytes.subarray(typeStart, dataStart);
    const type = typeBytes.toString('ascii');
    const data = bytes.subarray(dataStart, dataEnd);
    const actualCrc = bytes.readUInt32BE(crcOffset);
    const expectedCrc = crc32(typeBytes, data);
    if (actualCrc !== expectedCrc) errors.push(`png.crc: invalid CRC for ${type}`);
    if (!/^[A-Za-z]{4}$/.test(type)) errors.push(`png.structure: invalid chunk type ${type}`);
    if (!sawIHDR && type !== 'IHDR') errors.push('png.structure: IHDR must be the first chunk');
    if (type === 'IHDR') {
      if (sawIHDR) errors.push('png.structure: duplicate IHDR');
      sawIHDR = true;
      if (length !== 13) errors.push('png.structure: IHDR length must be 13');
      if (length >= 8) {
        width = bytes.readUInt32BE(dataStart);
        height = bytes.readUInt32BE(dataStart + 4);
        if (width === 0 || height === 0) errors.push('png.width: dimensions must be positive');
      }
      if (length >= 13) {
        bitDepth = bytes[dataStart + 8];
        colorType = bytes[dataStart + 9];
        compressionMethod = bytes[dataStart + 10];
        filterMethod = bytes[dataStart + 11];
        interlaceMethod = bytes[dataStart + 12];
      }
    } else if (type === 'IDAT') {
      sawIDAT = true;
      if (length === 0) errors.push('png.data: IDAT data must be non-empty');
      else idatParts.push(data);
    } else if (type === 'IEND') {
      sawIEND = true;
      if (length !== 0) errors.push('png.structure: IEND length must be zero');
      offset = crcOffset + 4;
      if (offset !== bytes.length) errors.push('png.trailing: bytes found after IEND');
      break;
    }
    offset = crcOffset + 4;
  }
  if (!sawIHDR) errors.push('png.structure: missing IHDR');
  if (!sawIDAT) errors.push('png.structure: missing IDAT');
  if (!sawIEND) errors.push('png.iend: missing final IEND');
  if (sawIEND && offset !== bytes.length) errors.push('png.trailing: PNG has trailing bytes');
  if (sawIDAT && idatParts.length && width && height && bitDepth && colorType !== undefined) {
    const channelsByColorType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
    const channels = channelsByColorType[colorType];
    if (!channels || ![1, 2, 4, 8, 16].includes(bitDepth)) errors.push('png.data: unsupported IHDR color type or bit depth');
    if (compressionMethod !== 0 || filterMethod !== 0 || interlaceMethod !== 0) errors.push('png.data: unsupported IHDR compression/filter/interlace');
    if (channels && [1, 2, 4, 8, 16].includes(bitDepth) && compressionMethod === 0 && filterMethod === 0 && interlaceMethod === 0) {
      const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
      const expectedDecodedBytes = height * (rowBytes + 1);
      if (!Number.isSafeInteger(expectedDecodedBytes) || expectedDecodedBytes > maxDecodedPngBytes) errors.push('png.data: decoded scanline budget exceeded');
      else {
        try {
          const decoded = inflateSync(Buffer.concat(idatParts), { maxOutputLength: expectedDecodedBytes });
          if (decoded.length !== expectedDecodedBytes) errors.push(`png.data: decoded scanline length ${decoded.length} does not equal ${expectedDecodedBytes}`);
          else for (let row = 0; row < height; row += 1) if (decoded[row * (rowBytes + 1)] > 4) errors.push(`png.data: invalid filter byte on row ${row}`);
        } catch (error) {
          errors.push(`png.data: IDAT zlib decode failed: ${error.message}`);
        }
      }
    }
  }
  return { errors, width, height, sawIHDR, sawIDAT, sawIEND };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function addMetadataErrors(errors, metadata, sourceBytes, generatorBytes) {
  if (!isPlainObject(metadata)) { errors.push('metadata.shape: metadata must be a non-null plain object'); return false; }
  if (JSON.stringify(Object.keys(metadata).sort()) !== JSON.stringify([...expectedMetadataKeys].sort())) errors.push('metadata.keys: metadata key set is not exact');
  for (const [key, value] of Object.entries(expectedMetadata)) if (JSON.stringify(metadata[key]) !== JSON.stringify(value)) errors.push(`metadata.${key}: value is not exact`);
  if (metadata.width !== expectedWidth) errors.push('metadata.width: width must be exactly 1440');
  if (metadata.height !== expectedHeight) errors.push('metadata.height: height must be exactly 1000');
  if (!Number.isInteger(metadata.bytes) || metadata.bytes <= 0 || metadata.bytes >= expectedBytesLimit) errors.push('metadata.bytes: bytes must be a positive integer under 1 MiB');
  if (!isSha256(metadata.sourceSha256)) errors.push('metadata.sourceSha256: must be lowercase SHA-256');
  if (!isSha256(metadata.generatorSha256)) errors.push('metadata.generatorSha256: must be lowercase SHA-256');
  if (!isSha256(metadata.sha256)) errors.push('metadata.sha256: must be lowercase SHA-256');
  if (sourceBytes && isSha256(metadata.sourceSha256) && metadata.sourceSha256 !== sha256(sourceBytes)) errors.push('source.sha256: source hash does not match metadata');
  if (generatorBytes && isSha256(metadata.generatorSha256) && metadata.generatorSha256 !== sha256(generatorBytes)) errors.push('generator.sha256: generator hash does not match metadata');
  return true;
}

function addSourceStaticErrors(errors, source) {
  for (const token of [...expectedMetadata.stableTokens, expectedMetadata.rawOnlySentinel]) if (!source.includes(token)) errors.push(`source.token: source is missing token ${token}`);
  for (const label of approvedVisibleLabels) {
    const exactLabel = new RegExp(`<dt>\\s*${label}:\\s*</dt>`, 'g');
    if ((source.match(exactLabel) ?? []).length !== 2) errors.push(`source.label: source must contain exactly two visible ${label}: labels`);
  }
  if (new RegExp(`<\\s*(${resourceNodeSelector.replaceAll(',', '|')})\\b`, 'i').test(source)) errors.push('source.resource: resource node is forbidden');
  if (/\b(?:src|href|srcset|poster)\s*=/i.test(source)) errors.push('source.resource: resource URL attribute is forbidden');
  if (/https?:\/\//i.test(source) || /data:/i.test(source) || /\/\//.test(source) || /\burl\s*\(/i.test(source) || /@import\b/i.test(source)) errors.push('source.resource: literal external/resource URL is forbidden');
  if (/<svg\b/i.test(source)) errors.push('source.resource: SVG is forbidden');
  for (const forbidden of ['Premier League', 'UEFA', 'FIFA', '世界杯', '英超', '中超', 'Nike', 'Adidas', 'Manchester', 'Liverpool', 'Real Madrid', 'logo']) if (new RegExp(forbidden, 'i').test(source)) errors.push(`source.rights: forbidden real-world mark ${forbidden}`);
}

async function validateRenderedSource(source, errors) {
  let browser;
  let context;
  const requestAttempts = [];
  try {
    browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
    context = await browser.newContext({ viewport: { width: expectedWidth, height: expectedHeight }, deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    const page = await context.newPage();
    await page.route('**/*', (route) => { requestAttempts.push(route.request().url()); return route.abort().catch(() => undefined); });
    await page.setContent(source, { waitUntil: 'load' });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
    await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
    const result = await page.evaluate(({ tokens, sentinel, labels, matches, resourceSelector }) => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const alphaIsZero = (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'transparent') return true;
        const functionMatch = normalized.match(/rgba?\(([^)]*)\)/);
        if (!functionMatch) return false;
        const body = functionMatch[1];
        const slashParts = body.split('/');
        if (slashParts.length > 1) return Number.parseFloat(slashParts[1]) === 0;
        const commaParts = body.split(',').map((part) => part.trim());
        return normalized.startsWith('rgba(') && commaParts.length >= 4 && Number.parseFloat(commaParts[3]) === 0;
      };
      const hasEffectiveTextPaint = (element) => {
        let current = element;
        while (current) {
          const computed = getComputedStyle(current);
          if (alphaIsZero(computed.color) || alphaIsZero(computed.getPropertyValue('-webkit-text-fill-color'))) return false;
          if (/opacity\(\s*(?:0|0%|0\.0+)\s*\)/i.test(computed.filter)) return false;
          if (/inset\(\s*100%(?:\s+100%){0,3}\s*\)|(?:circle|ellipse)\(\s*0(?:px|%)?/i.test(computed.clipPath)) return false;
          if (/rect\(\s*0(?:px)?\s*,\s*0(?:px)?\s*,\s*0(?:px)?\s*,\s*0(?:px)?\s*\)/i.test(computed.clip)) return false;
          const mask = `${computed.maskImage} ${computed.getPropertyValue('-webkit-mask-image')}`;
          if (/linear-gradient\([^)]*(?:transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))[^)]*(?:transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))[^)]*\)/i.test(mask)) return false;
          current = current.parentElement;
        }
        return true;
      };
      const visibleTextNodes = () => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const visible = [];
        let node;
        while ((node = walker.nextNode())) {
          const parent = node.parentElement;
          if (!parent || ['STYLE', 'SCRIPT', 'TEMPLATE'].includes(parent.tagName) || !node.textContent?.trim()) continue;
          let element = parent;
          let isVisible = true;
          while (element) {
            const computed = getComputedStyle(element);
            if (computed.display === 'none' || computed.visibility === 'hidden' || Number.parseFloat(computed.opacity) <= 0 || !hasEffectiveTextPaint(element)) { isVisible = false; break; }
            element = element.parentElement;
          }
          if (!isVisible) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const inViewport = [...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < viewport.width && rect.top < viewport.height);
          if (inViewport) visible.push(node.textContent);
        }
        return visible;
      };
      const isVisibleElement = (element) => {
        if (!element) return false;
        let current = element;
        while (current) {
          const computed = getComputedStyle(current);
          if (computed.display === 'none' || computed.visibility === 'hidden' || Number.parseFloat(computed.opacity) <= 0 || !hasEffectiveTextPaint(current)) return false;
          current = current.parentElement;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < viewport.width && rect.top < viewport.height;
      };
      const visibleText = visibleTextNodes().join(' ');
      const errors = [];
      for (const token of [...tokens, sentinel]) {
        const paintlessLeaf = [...document.querySelectorAll('*')].find((node) => node.children.length === 0 && node.textContent.includes(token) && !hasEffectiveTextPaint(node));
        if (paintlessLeaf) errors.push(`render.visibility: token paint is fully transparent or clipped ${token}`);
        if (!visibleText.includes(token) || !document.body.innerText.includes(token)) errors.push(`render.token: token is not actual visible text ${token}`);
      }
      for (const label of labels) {
        const nodes = [...document.querySelectorAll('dt')].filter((node) => node.textContent.trim() === `${label}:`);
        if (nodes.length !== 2 || nodes.some((node) => !isVisibleElement(node))) errors.push(`render.label: exact visible ${label}: dt count is not two`);
      }
      const matchBlocks = [...document.querySelectorAll('.match')];
      if (matchBlocks.length !== matches.length || matchBlocks.some((block) => !isVisibleElement(block))) errors.push('render.match: match blocks are not exactly two visible blocks');
      const readExactRowValue = (block, label) => {
        const labels = [...block.querySelectorAll('dt')].filter((node) => node.textContent.trim() === `${label}:`);
        if (labels.length !== 1 || !isVisibleElement(labels[0])) return { error: `render.match.field: ${label}: must have one visible dt` };
        const row = labels[0].closest('.row');
        const values = row ? [...row.querySelectorAll('dd')] : [];
        if (values.length !== 1 || !isVisibleElement(values[0])) return { error: `render.match.field: ${label}: must have one visible dd in the same row` };
        return { value: values[0].textContent.trim() };
      };
      for (const [index, match] of matches.entries()) {
        const block = matchBlocks[index];
        if (!block || !isVisibleElement(block)) {
          errors.push(`render.match: visible fictional block missing for ${match.token}`);
          continue;
        }
        for (const [label, expected] of Object.entries(match.rows)) {
          const actual = readExactRowValue(block, label);
          if (actual.error) errors.push(actual.error);
          else if (actual.value !== expected) {
            const code = label === 'MATCH REF' || label === 'MARKET REF' ? 'render.match.ref' : 'render.match.field';
            errors.push(`${code}: ${match.token} ${label}: expected ${expected}, got ${actual.value}`);
          }
        }
      }
      if (document.documentElement.scrollWidth !== viewport.width || document.documentElement.scrollHeight !== viewport.height || document.body.scrollWidth !== viewport.width || document.body.scrollHeight !== viewport.height) errors.push('render.overflow: document scroll exceeds fixed viewport');
      const badNodes = [...document.querySelectorAll(resourceSelector)].map((node) => node.tagName.toLowerCase());
      if (badNodes.length) errors.push(`render.resource: forbidden nodes ${badNodes.join(',')}`);
      const badAttrs = [...document.querySelectorAll('*')].flatMap((node) => [...node.attributes].filter((attribute) => ['src', 'href', 'srcset', 'poster'].includes(attribute.name.toLowerCase())).map((attribute) => attribute.name));
      if (badAttrs.length) errors.push(`render.resource: forbidden URL attributes ${badAttrs.join(',')}`);
      return errors;
    }, { tokens: expectedMetadata.stableTokens, sentinel: expectedMetadata.rawOnlySentinel, labels: approvedVisibleLabels, matches: expectedMatches, resourceSelector: resourceNodeSelector });
    if (requestAttempts.length) errors.push(`render.network: unexpected requests attempted ${requestAttempts.join(',')}`);
    errors.push(...result);
  } catch (error) {
    errors.push(`render.browser: ${error.message}`);
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
  }
}

async function validateFictionalOcrFixture(root = repoRoot) {
  const errors = [];
  const paths = {
    source: join(root, sourceRelativePath),
    metadata: join(root, metadataRelativePath),
    generator: join(root, 'scripts', 'generate-fictional-ocr-sample.mjs'),
    target: join(root, targetRelativePath),
    publicDirectory: join(root, 'apps', 'web', 'public', 'ocr-samples'),
  };
  const readRegularFile = (path, label) => {
    try {
      const lstat = lstatSync(path);
      if (lstat.isSymbolicLink()) errors.push(`${label}.symlink: symlinks are forbidden`);
      if (!lstat.isFile()) errors.push(`${label}.missing: not a regular file`);
      return lstat.isFile() && !lstat.isSymbolicLink();
    } catch {
      errors.push(`${label}.missing: file is missing`);
      return false;
    }
  };
  const sourceExists = readRegularFile(paths.source, 'source');
  const metadataExists = readRegularFile(paths.metadata, 'metadata');
  const generatorExists = readRegularFile(paths.generator, 'generator');
  const targetExists = readRegularFile(paths.target, 'target');
  let publicDirectoryIsUsable = false;
  try {
    const publicLstat = lstatSync(paths.publicDirectory);
    if (publicLstat.isSymbolicLink()) errors.push('public.path: public OCR directory is a symlink or junction');
    else if (!publicLstat.isDirectory()) errors.push('public.path: public OCR path is not a directory');
    else {
      const expectedPublicPath = resolve(root, 'apps/web/public/ocr-samples');
      const actualPublicPath = resolve(realpathSync(paths.publicDirectory));
      if (actualPublicPath.toLowerCase() !== expectedPublicPath.toLowerCase()) errors.push('public.path: public OCR directory realpath escapes approved root');
      else publicDirectoryIsUsable = true;
    }
  } catch {
    errors.push('public.missing: public OCR directory is missing');
  }
  if (publicDirectoryIsUsable) {
    try {
      const publicEntries = readdirSync(paths.publicDirectory);
      if (publicEntries.length !== 1 || publicEntries[0] !== 'fictional-golden.png') errors.push('public.artifacts: public OCR directory contains unapproved artifacts');
    } catch {
      errors.push('public.missing: public OCR directory is not readable');
    }
  }
  let metadata;
  let sourceBytes;
  let generatorBytes;
  let targetBytes;
  if (sourceExists) sourceBytes = readFileSync(paths.source);
  if (generatorExists) generatorBytes = readFileSync(paths.generator);
  if (metadataExists) {
    try { metadata = JSON.parse(readFileSync(paths.metadata, 'utf8')); } catch (error) { errors.push(`metadata.json: invalid JSON ${error.message}`); }
  }
  const metadataValid = addMetadataErrors(errors, metadata, sourceBytes, generatorBytes);
  if (targetExists) targetBytes = readFileSync(paths.target);
  if (targetBytes) {
    if (targetBytes.length >= expectedBytesLimit) errors.push('png.bytes: PNG exceeds 1 MiB');
    if (!metadataValid || !isSha256(metadata?.sha256) || targetBytes.length !== metadata.bytes) errors.push('png.metadata: bytes do not match metadata');
    if (metadataValid && isSha256(metadata.sha256) && sha256(targetBytes) !== metadata.sha256) errors.push('png.sha256: PNG hash does not match metadata');
    const parsed = parsePng(targetBytes);
    errors.push(...parsed.errors);
    if (parsed.width !== expectedWidth) errors.push('png.width: PNG width must be exactly 1440');
    if (parsed.height !== expectedHeight) errors.push('png.height: PNG height must be exactly 1000');
  }
  if (sourceBytes) addSourceStaticErrors(errors, sourceBytes.toString('utf8'));
  if (errors.length === 0 && sourceBytes) await validateRenderedSource(sourceBytes.toString('utf8'), errors);
  return errors;
}

function assertApprovedTargetPath() {
  const resolvedRoot = resolve(repoRoot);
  const publicDirectory = resolve(repoRoot, 'apps/web/public/ocr-samples');
  const resolvedTarget = resolve(publicDirectory, 'fictional-golden.png');
  if (resolvedTarget !== targetPath || !resolvedTarget.toLowerCase().startsWith(`${resolvedRoot.toLowerCase()}${sep}`)) throw new Error('target path is outside the approved public fixture path');
  mkdirSync(publicDirectory, { recursive: true });
  if (realpathSync(publicDirectory).toLowerCase() !== publicDirectory.toLowerCase()) throw new Error('approved public fixture directory resolves through a symlink');
  try {
    if (lstatSync(resolvedTarget).isSymbolicLink()) throw new Error('approved PNG target is a symlink');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return resolvedTarget;
}

async function generate() {
  const source = readFileSync(sourcePath, 'utf8');
  const approvedTarget = assertApprovedTargetPath();
  let browser;
  let context;
  const requestAttempts = [];
  try {
    browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
    context = await browser.newContext({ viewport: { width: expectedWidth, height: expectedHeight }, deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    const page = await context.newPage();
    await page.route('**/*', (route) => { requestAttempts.push(route.request().url()); return route.abort().catch(() => undefined); });
    await page.setContent(source, { waitUntil: 'load' });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
    await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
    if (requestAttempts.length) throw new Error(`unexpected requests attempted: ${requestAttempts.join(',')}`);
    await page.screenshot({ path: approvedTarget, clip: { x: 0, y: 0, width: expectedWidth, height: expectedHeight }, animations: 'disabled' });
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
  }
  const bytes = readFileSync(approvedTarget);
  console.log(`${targetRelativePath} bytes=${bytes.length} sha256=${sha256(bytes)}`);
}

export { assertApprovedTargetPath, crc32, parsePng, validateFictionalOcrFixture };

if (process.argv[1] && resolve(process.argv[1]) === generatorPath) await generate();
