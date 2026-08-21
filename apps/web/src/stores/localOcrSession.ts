import {
  createDraftSeed,
  validateCandidateBatch,
  type CandidateBatch,
  type DraftSeed,
  type SourceDeclaration,
} from '@football-lottery-analysis-lab/ocr-core';
import { defineStore } from 'pinia';

import type { OcrCandidateDraftSeed } from '@/ocr/ocrRunController';

const SERIALIZATION_MESSAGE = 'Local OCR session state cannot be serialized.';
const UNSAFE_INPUT_MESSAGE = 'Local OCR session input is unsafe.';
const MAX_SAFE_NODES = 20_000;
const UNSAFE_KEYS = new Set([
  'apikey',
  'blob',
  'canvas',
  'file',
  'filename',
  'lines',
  'previewurl',
  'rawtext',
  'text',
  'words',
]);

export class LocalOcrSessionSerializationError extends Error {
  constructor() {
    super(SERIALIZATION_MESSAGE);
    this.name = 'LocalOcrSessionSerializationError';
  }
}

export class LocalOcrSessionUnsafeInputError extends Error {
  constructor() {
    super(UNSAFE_INPUT_MESSAGE);
    this.name = 'LocalOcrSessionUnsafeInputError';
  }
}

interface LocalOcrSessionState {
  sourceDeclaration: SourceDeclaration | null;
  candidateBatch: CandidateBatch | null;
  draftSeed: DraftSeed | null;
  meanConfidence: number | null;
}

function rejectSerialization(): never {
  throw new LocalOcrSessionSerializationError();
}

function createState(): LocalOcrSessionState {
  const state: LocalOcrSessionState = {
    sourceDeclaration: null,
    candidateBatch: null,
    draftSeed: null,
    meanConfidence: null,
  };
  Object.defineProperty(state, 'toJSON', {
    configurable: false,
    enumerable: false,
    value: rejectSerialization,
    writable: false,
  });
  return state;
}

function unsafeInput(): never {
  throw new LocalOcrSessionUnsafeInputError();
}

function readOwnData(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) return unsafeInput();
  return descriptor.value;
}

function assertExactResultShape(value: unknown): asserts value is OcrCandidateDraftSeed {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return unsafeInput();
  let keys: readonly (string | symbol)[];
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return unsafeInput();
    keys = Reflect.ownKeys(value);
  } catch {
    return unsafeInput();
  }
  const expected = ['candidateBatch', 'draftSeed', 'meanConfidence'];
  if (
    keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key))
  ) {
    return unsafeInput();
  }
}

function assertNoUnsafePayload(value: unknown): void {
  let visited = 0;
  const visit = (entry: unknown): void => {
    visited += 1;
    if (visited > MAX_SAFE_NODES) return unsafeInput();
    if (typeof entry === 'string') {
      const normalized = entry.trim().toLowerCase();
      if (
        normalized.startsWith('data:image/')
        || normalized.startsWith('ivborw0kggo')
        || normalized.startsWith('/9j/')
      ) {
        return unsafeInput();
      }
      return;
    }
    if (entry === null || typeof entry !== 'object') return;
    if (
      (typeof File !== 'undefined' && entry instanceof File)
      || (typeof Blob !== 'undefined' && entry instanceof Blob)
    ) {
      return unsafeInput();
    }
    let keys: readonly (string | symbol)[];
    try {
      const prototype = Object.getPrototypeOf(entry);
      if (
        !Array.isArray(entry)
        && prototype !== Object.prototype
        && prototype !== null
      ) {
        return unsafeInput();
      }
      keys = Reflect.ownKeys(entry);
    } catch {
      return unsafeInput();
    }
    for (const key of keys) {
      if (key === 'length' && Array.isArray(entry)) continue;
      if (typeof key !== 'string' || UNSAFE_KEYS.has(key.toLowerCase())) return unsafeInput();
      visit(readOwnData(entry, key));
    }
  };
  visit(value);
}

function isSourceDeclaration(value: unknown): value is SourceDeclaration {
  return value === 'FICTIONAL_SAMPLE' || value === 'USER_OWNED_AUTHORIZED';
}

export const useLocalOcrSessionStore = defineStore('localOcrSession', {
  state: createState,
  actions: {
    setResult(source: SourceDeclaration, input: OcrCandidateDraftSeed): void {
      if (!isSourceDeclaration(source)) return unsafeInput();
      assertExactResultShape(input);
      assertNoUnsafePayload(input);

      const meanConfidence = readOwnData(input, 'meanConfidence');
      if (
        typeof meanConfidence !== 'number'
        || !Number.isFinite(meanConfidence)
        || meanConfidence < 0
        || meanConfidence > 1
      ) {
        return unsafeInput();
      }
      const candidateValidation = validateCandidateBatch(readOwnData(input, 'candidateBatch'));
      if (!candidateValidation.valid) return unsafeInput();
      const draft = createDraftSeed(candidateValidation);
      if (!draft.valid) return unsafeInput();

      this.sourceDeclaration = source;
      this.candidateBatch = candidateValidation.value;
      this.draftSeed = draft.value;
      this.meanConfidence = meanConfidence;
    },
    clear(): void {
      this.sourceDeclaration = null;
      this.candidateBatch = null;
      this.draftSeed = null;
      this.meanConfidence = null;
    },
    toJSON(): never {
      return rejectSerialization();
    },
  },
});
