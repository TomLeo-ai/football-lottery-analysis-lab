import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import type { OcrCandidateDraftSeed } from '@/ocr/ocrRunController';

import {
  LocalOcrSessionSerializationError,
  LocalOcrSessionUnsafeInputError,
  useLocalOcrSessionStore,
} from './localOcrSession';
import localOcrSessionSource from './localOcrSession.ts?raw';

function createResult(): OcrCandidateDraftSeed {
  return {
    candidateBatch: {
      schemaVersion: 'OCR_CANDIDATE_V2',
      processedImage: {
        schemaVersion: 'IMAGE_TRANSFORM_V1',
        sourceSize: { width: 320, height: 180 },
        normalizedSize: { width: 320, height: 180 },
        rotation: 0,
        crop: null,
        redactions: [],
        processedSize: { width: 320, height: 180 },
      },
      fields: [
        {
          fieldId: '550e8400-e29b-41d4-a716-446655440001',
          entityType: 'MATCH',
          entityKey: '550e8400-e29b-41d4-a716-446655440002',
          fieldName: 'league',
          fieldValue: 'Detached League',
          confidence: 0.82,
        },
      ],
    },
    draftSeed: {
      matches: [
        {
          draftMatchKey: '550e8400-e29b-41d4-a716-446655440002',
          matchDate: '',
          league: 'Detached League',
          homeTeam: '',
          awayTeam: '',
          kickoffTime: '',
          evidence: {
            league: {
              fieldId: '550e8400-e29b-41d4-a716-446655440001',
              confidence: 0.82,
            },
          },
        },
      ],
      markets: [],
    },
    meanConfidence: 0.82,
  };
}

describe('localOcrSession store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps only detached minimized controller output in transient state', () => {
    const store = useLocalOcrSessionStore();
    const result = createResult();

    store.setResult('USER_OWNED_AUTHORIZED', result);
    result.candidateBatch.fields[0].fieldValue = 'Mutated Outside';

    expect(Object.keys(store.$state).sort()).toEqual([
      'candidateBatch',
      'draftSeed',
      'meanConfidence',
      'sourceDeclaration',
    ]);
    expect(store.sourceDeclaration).toBe('USER_OWNED_AUTHORIZED');
    expect(store.candidateBatch?.fields[0]?.fieldValue).toBe('Detached League');
    expect(store.draftSeed?.matches[0]?.league).toBe('Detached League');
    expect(store.meanConfidence).toBe(0.82);
  });

  it('clears all transient output synchronously', () => {
    const store = useLocalOcrSessionStore();
    store.setResult('FICTIONAL_SAMPLE', createResult());

    store.clear();

    expect(store.sourceDeclaration).toBeNull();
    expect(store.candidateBatch).toBeNull();
    expect(store.draftSeed).toBeNull();
    expect(store.meanConfidence).toBeNull();
  });

  it('rejects serialization of both root state and store with a stable error', () => {
    const store = useLocalOcrSessionStore();
    store.setResult('FICTIONAL_SAMPLE', createResult());

    for (const value of [store.$state, store]) {
      expect(() => JSON.stringify(value)).toThrow(LocalOcrSessionSerializationError);
      expect(() => JSON.stringify(value)).toThrow('Local OCR session state cannot be serialized.');
    }
  });

  it('rejects unsafe extras and contains no persistence configuration', () => {
    const store = useLocalOcrSessionStore();
    const unsafe = {
      ...createResult(),
      rawText: 'private adapter output',
      file: new File(['private'], 'private.png', { type: 'image/png' }),
    } as unknown as OcrCandidateDraftSeed;

    expect(() => store.setResult('FICTIONAL_SAMPLE', unsafe))
      .toThrow(LocalOcrSessionUnsafeInputError);
    expect(store.candidateBatch).toBeNull();
    expect(localOcrSessionSource).not.toMatch(/\$persist|persist\s*:/);
    expect(localOcrSessionSource).not.toContain('localStorage');
    expect(localOcrSessionSource).not.toContain('sessionStorage');
  });
});
