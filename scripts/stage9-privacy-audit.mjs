import { createHash } from 'node:crypto';

const policyStates = new WeakMap();

const IMAGE_BASE64_PREFIXES = [
  /iVBORw0KGgo/,
  /\/9j\//,
  /UklGR/,
];

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function requireToken(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Privacy policy ${name} must be a non-empty string`);
  }
  return value;
}

function jsonUnicodeEscape(value) {
  let escaped = '';
  for (let index = 0; index < value.length; index += 1) {
    escaped += `\\u${value.charCodeAt(index).toString(16).padStart(4, '0')}`;
  }
  return escaped;
}

function urlVariants(value) {
  const encoded = encodeURIComponent(value);
  const plusEncoded = encoded.replace(/%20/gi, '+');
  return [
    encoded,
    encoded.replace(/%[0-9A-F]{2}/g, (part) => part.toLowerCase()),
    plusEncoded,
    plusEncoded.replace(/%[0-9A-F]{2}/g, (part) => part.toLowerCase()),
  ];
}

function createTokenRule(category, value) {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  const jsonEscaped = JSON.stringify(value).slice(1, -1);

  return Object.freeze({
    category,
    raw: value,
    variants: Object.freeze([
      value,
      ...urlVariants(value),
      jsonEscaped,
      jsonUnicodeEscape(value),
      base64,
      base64.replace(/=+$/u, ''),
    ].filter((candidate, index, variants) => candidate.length > 0 && variants.indexOf(candidate) === index)),
  });
}

function requirePolicy(policy) {
  if ((typeof policy !== 'object' && typeof policy !== 'function') || policy === null) {
    throw new TypeError('A privacy policy created by createPrivacyPolicy is required');
  }

  const state = policyStates.get(policy);
  if (!state) {
    throw new TypeError('A privacy policy created by createPrivacyPolicy is required');
  }
  return state;
}

function decodeUrlForm(text) {
  try {
    return decodeURIComponent(text.replace(/\+/gu, ' '));
  } catch {
    return text;
  }
}

function decodeJsonEscapes(text) {
  const simpleEscapes = Object.freeze({
    '"': '"',
    "'": "'",
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
  });

  return text
    .replace(/\\u([0-9a-f]{4})/giu, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\(["'\\/bfnrt])/gu, (_match, code) => simpleEscapes[code]);
}

function searchableForms(text) {
  const urlDecoded = decodeUrlForm(text);
  const jsonDecoded = decodeJsonEscapes(text);
  return [
    text,
    urlDecoded,
    jsonDecoded,
    decodeJsonEscapes(urlDecoded),
    decodeUrlForm(jsonDecoded),
  ].filter((candidate, index, forms) => forms.indexOf(candidate) === index);
}

function includesRule(forms, rule) {
  return forms.some((form) => rule.variants.some((variant) => form.includes(variant)) || form.includes(rule.raw));
}

function safeRequestPart(value, state, fallback, { stripQuery = false } = {}) {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  const forms = searchableForms(value);
  if (state.tokenRules.some((rule) => includesRule(forms, rule))) return fallback;
  if (!stripQuery) return value;
  const queryIndex = value.search(/[?#]/u);
  const safeValue = queryIndex === -1 ? value : value.slice(0, queryIndex);
  return safeValue.length > 0 ? safeValue : fallback;
}

function finding(category, method, path, digest) {
  return Object.freeze({ category, method, path, sha256: digest });
}

function isFinding(value) {
  return value !== null
    && typeof value === 'object'
    && Object.keys(value).length === 4
    && Object.keys(value).every((key) => ['category', 'method', 'path', 'sha256'].includes(key))
    && typeof value.category === 'string'
    && typeof value.method === 'string'
    && typeof value.path === 'string'
    && typeof value.sha256 === 'string'
    && /^[0-9a-f]{64}$/iu.test(value.sha256);
}

class PrivacyAuditError extends Error {
  constructor(findings) {
    const categories = [...new Set(findings.map(({ category }) => category))].sort();
    super(`Privacy evidence audit found ${findings.length} finding(s): ${categories.join(', ')}`);
    this.name = 'PrivacyAuditError';
    Object.defineProperty(this, 'findings', {
      enumerable: true,
      value: Object.freeze([...findings]),
    });
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      findings: this.findings,
    };
  }
}

export function createPrivacyPolicy({ rawOnlySentinel, originalFileName } = {}) {
  const sentinel = requireToken(rawOnlySentinel, 'raw-only sentinel');
  const fileName = requireToken(originalFileName, 'original file name');
  const policy = Object.freeze(Object.create(null));
  policyStates.set(policy, Object.freeze({
    tokenRules: Object.freeze([
      createTokenRule('raw-only-sentinel', sentinel),
      createTokenRule('original-file-name', fileName),
    ]),
  }));
  return policy;
}

export function scanPrivacyEvidenceItem(policy, item) {
  const state = requirePolicy(policy);
  if (item === null || typeof item !== 'object') {
    throw new TypeError('Privacy evidence item must be an object');
  }
  if (typeof item.content !== 'string' && !Buffer.isBuffer(item.content)) {
    throw new TypeError('Privacy evidence content must be a string or Buffer');
  }

  const bytes = Buffer.isBuffer(item.content) ? item.content : Buffer.from(item.content, 'utf8');
  const text = bytes.toString('utf8');
  const forms = searchableForms(text);
  const contentType = typeof item.contentType === 'string' ? item.contentType : '';
  const method = safeRequestPart(item.method, state, '[redacted-method]');
  const path = safeRequestPart(item.path, state, '[redacted-path]', { stripQuery: true });
  const digest = sha256(bytes);
  const categories = new Set();

  for (const rule of state.tokenRules) {
    if (includesRule(forms, rule)) categories.add(rule.category);
  }

  if (/data\s*:\s*image\s*\//iu.test(text)) categories.add('image-data-url');
  if (IMAGE_BASE64_PREFIXES.some((pattern) => pattern.test(text))) categories.add('image-base64-prefix');
  if (/\b(?:rawText|raw_text)\b/iu.test(text)) categories.add('raw-text-field');

  const multipart = /^multipart\/form-data(?:\s*;|\s*$)/iu.test(contentType)
    || /content-disposition\s*:\s*form-data/iu.test(text);
  if (multipart) {
    if (/\bfilename\*?\s*=/iu.test(text)) categories.add('multipart-filename');
    if (
      /\bname\s*=\s*["']?(?:image|file|screenshot|upload)(?:["';\r\n]|$)/iu.test(text)
      || /\bcontent-type\s*:\s*image\//iu.test(text)
    ) {
      categories.add('multipart-file-field');
    }
  }

  return [...categories].map((category) => finding(category, method, path, digest));
}

export function scanPrivacyEvidence(policy, items) {
  requirePolicy(policy);
  if (!Array.isArray(items)) throw new TypeError('Privacy evidence items must be an array');
  return items.flatMap((item) => scanPrivacyEvidenceItem(policy, item));
}

export function assertPrivacyClean(findings) {
  if (!Array.isArray(findings) || !findings.every(isFinding)) {
    throw new TypeError('Privacy findings must be an array returned by the scanner');
  }
  if (findings.length > 0) throw new PrivacyAuditError(findings);
  return findings;
}
