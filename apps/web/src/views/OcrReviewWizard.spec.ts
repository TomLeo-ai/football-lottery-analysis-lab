import type { CandidateBatch, DraftSeed } from '@football-lottery-analysis-lab/ocr-core';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLocalOcrSessionStore } from '@/stores/localOcrSession';
import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';

import OcrReviewWizard from './OcrReviewWizard.vue';
import ocrReviewWizardSource from './OcrReviewWizard.vue?raw';

const TRANSFORM = Object.freeze({
  schemaVersion: 'IMAGE_TRANSFORM_V1' as const,
  sourceSize: Object.freeze({ width: 800, height: 600 }),
  normalizedSize: Object.freeze({ width: 800, height: 600 }),
  rotation: 0 as const,
  crop: null,
  redactions: Object.freeze([]),
  processedSize: Object.freeze({ width: 800, height: 600 }),
});

const MATCH_A = '550e8400-e29b-41d4-a716-446655440101';
const MATCH_B = '550e8400-e29b-41d4-a716-446655440102';
const MARKET_A = '550e8400-e29b-41d4-a716-446655440201';
const MARKET_B = '550e8400-e29b-41d4-a716-446655440202';

function candidateBatch(): CandidateBatch {
  return {
    schemaVersion: 'OCR_CANDIDATE_V2',
    processedImage: TRANSFORM,
    fields: [
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441000',
        entityType: 'MATCH',
        entityKey: MATCH_A,
        fieldName: 'matchDate',
        fieldValue: '2030-04-01',
        confidence: 0.88,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441001',
        entityType: 'MATCH',
        entityKey: MATCH_A,
        fieldName: 'league',
        fieldValue: 'Original League',
        confidence: 0.52,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441002',
        entityType: 'MATCH',
        entityKey: MATCH_A,
        fieldName: 'homeTeam',
        fieldValue: 'Blue Harbor',
        confidence: 0.92,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441003',
        entityType: 'MATCH',
        entityKey: MATCH_A,
        fieldName: 'awayTeam',
        fieldValue: 'Red Maple',
        confidence: 0.9,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441004',
        entityType: 'MATCH',
        entityKey: MATCH_A,
        fieldName: 'kickoffTime',
        fieldValue: '2030-04-01T19:30:00+08:00',
        confidence: 0.86,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441005',
        entityType: 'MATCH',
        entityKey: MATCH_B,
        fieldName: 'matchDate',
        fieldValue: '2030-04-02',
        confidence: 0.88,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441006',
        entityType: 'MATCH',
        entityKey: MATCH_B,
        fieldName: 'league',
        fieldValue: 'Original League',
        confidence: 0.91,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441007',
        entityType: 'MATCH',
        entityKey: MATCH_B,
        fieldName: 'homeTeam',
        fieldValue: 'Night Falcons',
        confidence: 0.91,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441008',
        entityType: 'MATCH',
        entityKey: MATCH_B,
        fieldName: 'awayTeam',
        fieldValue: 'Star Valley',
        confidence: 0.91,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441009',
        entityType: 'MATCH',
        entityKey: MATCH_B,
        fieldName: 'kickoffTime',
        fieldValue: '2030-04-02T20:00:00+08:00',
        confidence: 0.91,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441010',
        entityType: 'MARKET',
        entityKey: MARKET_A,
        fieldName: 'matchRef',
        fieldValue: MATCH_A,
        confidence: 0.84,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441011',
        entityType: 'MARKET',
        entityKey: MARKET_A,
        fieldName: 'playType',
        fieldValue: 'WIN_DRAW_LOSS',
        confidence: 0.84,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441012',
        entityType: 'MARKET',
        entityKey: MARKET_A,
        fieldName: 'selection',
        fieldValue: 'HOME_WIN',
        confidence: 0.84,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441013',
        entityType: 'MARKET',
        entityKey: MARKET_A,
        fieldName: 'odds',
        fieldValue: '2.15',
        confidence: 0.84,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441014',
        entityType: 'MARKET',
        entityKey: MARKET_B,
        fieldName: 'matchRef',
        fieldValue: MATCH_B,
        confidence: 0.84,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441015',
        entityType: 'MARKET',
        entityKey: MARKET_B,
        fieldName: 'playType',
        fieldValue: 'WIN_DRAW_LOSS',
        confidence: 0.84,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441016',
        entityType: 'MARKET',
        entityKey: MARKET_B,
        fieldName: 'selection',
        fieldValue: 'DRAW',
        confidence: 0.84,
      },
      {
        fieldId: '550e8400-e29b-41d4-a716-446655441017',
        entityType: 'MARKET',
        entityKey: MARKET_B,
        fieldName: 'odds',
        fieldValue: '3.4',
        confidence: 0.84,
      },
    ],
  };
}

function draftSeed(): DraftSeed {
  return {
    matches: [
      {
        draftMatchKey: MATCH_A,
        matchDate: '2030-04-01',
        league: 'Original League',
        homeTeam: 'Blue Harbor',
        awayTeam: 'Red Maple',
        kickoffTime: '2030-04-01T19:30:00+08:00',
        evidence: {
          league: {
            fieldId: '550e8400-e29b-41d4-a716-446655441001',
            confidence: 0.52,
          },
          homeTeam: {
            fieldId: '550e8400-e29b-41d4-a716-446655441002',
            confidence: 0.92,
          },
        },
      },
      {
        draftMatchKey: MATCH_B,
        matchDate: '2030-04-02',
        league: 'Original League',
        homeTeam: 'Night Falcons',
        awayTeam: 'Star Valley',
        kickoffTime: '2030-04-02T20:00:00+08:00',
        evidence: {},
      },
    ],
    markets: [
      {
        draftMarketKey: MARKET_A,
        draftMatchKey: MATCH_A,
        playType: 'WIN_DRAW_LOSS',
        selection: 'HOME_WIN',
        odds: '2.15',
        evidence: {},
      },
      {
        draftMarketKey: MARKET_B,
        draftMatchKey: MATCH_B,
        playType: 'WIN_DRAW_LOSS',
        selection: 'DRAW',
        odds: '3.4',
        evidence: {},
      },
    ],
  };
}

function seedLocalSession() {
  const localSession = useLocalOcrSessionStore();
  localSession.setResult('FICTIONAL_SAMPLE', {
    candidateBatch: candidateBatch(),
    draftSeed: draftSeed(),
    meanConfidence: 0.58,
  });
}

describe('OcrReviewWizard', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('contains no legacy confirm API, hardcoded demo payload, or server id invention', () => {
    for (const token of [
      '@/api/ocrWorkflow',
      'confirmOcrReview',
      'BROWSER_LOCAL_MOCK',
      'demo-match-001',
      'demo-market-001',
      'Northport United',
      'Lakeside City',
    ]) {
      expect(ocrReviewWizardSource).not.toContain(token);
    }
  });

  it('consumes the local OCR session once and edits a local draft without calling an API', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    seedLocalSession();

    const wrapper = mount(OcrReviewWizard, {
      global: {
        plugins: [pinia],
      },
    });
    await flushPromises();

    const localSession = useLocalOcrSessionStore();
    expect(localSession.candidateBatch).toBeNull();
    expect(wrapper.text()).toContain('Original League');
    expect(wrapper.text()).toContain('Blue Harbor');
    expect(wrapper.text()).toContain('低置信度证据');
    expect(wrapper.get('[data-testid="save-review-draft"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="confirm-review-draft"]').attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="match-league-0"]').setValue('Edited League');
    await wrapper.get('[data-testid="add-draft-match"]').trigger('click');
    await wrapper.get('[data-testid="move-match-up-2"]').trigger('click');
    await wrapper.get('[data-testid="delete-match-1"]').trigger('click');
    await flushPromises();

    expect((wrapper.get('[data-testid="match-league-0"]').element as HTMLInputElement).value)
      .toBe('Edited League');
    expect(wrapper.text()).not.toContain('USER_SCREENSHOT_CONFIRMED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows a non-persisted empty state on refresh or direct entry', () => {
    const workflowStore = useOcrWorkflowStore();
    workflowStore.setReviewDraft({
      ocrTaskId: 'legacy-task',
      screenshotTaskId: 'legacy-shot',
      ocrProvider: 'LEGACY',
      status: 'WAITING_USER_CONFIRMATION',
      analysisAllowed: false,
      fields: [],
    });

    const wrapper = mount(OcrReviewWizard, {
      global: {
        plugins: [pinia],
      },
    });

    expect(wrapper.text()).toContain('本地草稿尚未持久化');
    expect(wrapper.text()).not.toContain('legacy-task');
    expect(wrapper.find('[data-testid="confirm-ocr-button"]').exists()).toBe(false);
  });
});
