import type { CandidateBatch, DraftSeed } from '@football-lottery-analysis-lab/ocr-core';
import { describe, expect, it } from 'vitest';

import type { LocalReviewDraft } from '@/types/ocrWorkflow';

import {
  addDraftMatch,
  addWinDrawLossMarket,
  buildLocalReviewDraft,
  moveDraftMatch,
  removeDraftMatch,
  updateDraftMarket,
  updateDraftMatch,
  validateReviewDraft,
} from './reviewDraftValidation';

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
        entityType: 'MARKET',
        entityKey: MARKET_A,
        fieldName: 'matchRef',
        fieldValue: MATCH_A,
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
        evidence: {
          matchRef: {
            fieldId: '550e8400-e29b-41d4-a716-446655441003',
            confidence: 0.84,
          },
        },
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

function localDraft(): LocalReviewDraft {
  return buildLocalReviewDraft({
    candidateBatch: candidateBatch(),
    draftSeed: draftSeed(),
    sourceDeclaration: 'FICTIONAL_SAMPLE',
    meanConfidence: 0.58,
  });
}

describe('reviewDraftValidation', () => {
  it('builds a local editable draft without formal server ids and keeps candidate evidence separate', () => {
    const draft = localDraft();

    expect(draft.status).toBe('LOCAL_EDITING');
    expect(draft.analysisAllowed).toBe(false);
    expect(JSON.stringify(draft)).not.toMatch(/matchId|marketId|snapshotId|ocrTaskId/);

    draft.matches[0].league = 'Edited Final League';

    expect(draft.candidateBatch.fields[0]?.fieldValue).toBe('Original League');
    expect(draft.matches[0].league).toBe('Edited Final League');
    expect(validateReviewDraft(draft)).toMatchObject({
      valid: true,
      warnings: [expect.objectContaining({ code: 'LOW_CONFIDENCE_EVIDENCE' })],
    });
  });

  it('supports create, edit, reorder, and cascading delete for two local matches', () => {
    const draft = localDraft();
    const added = addDraftMatch(draft, () => '550e8400-e29b-41d4-a716-446655440103');
    const addedKey = added.matches[2].draftMatchKey;
    updateDraftMatch(added, addedKey, {
      matchDate: '2030-04-03',
      league: 'New League',
      homeTeam: 'New Home',
      awayTeam: 'New Away',
      kickoffTime: '2030-04-03T18:00:00+08:00',
    });
    addWinDrawLossMarket(
      added,
      addedKey,
      () => '550e8400-e29b-41d4-a716-446655440203',
    );
    updateDraftMarket(added, added.markets[2].draftMarketKey, {
      selection: 'AWAY_WIN',
      odds: '4.125',
    });

    moveDraftMatch(added, addedKey, 'UP');
    const afterDelete = removeDraftMatch(added, MATCH_A);

    expect(afterDelete.matches.map((match) => match.draftMatchKey)).toEqual([
      addedKey,
      MATCH_B,
    ]);
    expect(afterDelete.markets.map((market) => market.draftMatchKey)).not.toContain(MATCH_A);
    expect(validateReviewDraft(afterDelete).valid).toBe(true);
  });

  it('rejects duplicate keys, orphan markets, second markets, invalid final fields, and formal ids', () => {
    const draft = localDraft() as LocalReviewDraft & {
      matchId?: string;
      matches: Array<LocalReviewDraft['matches'][number] & { matchId?: string }>;
      markets: Array<LocalReviewDraft['markets'][number] & { marketId?: string }>;
    };

    draft.budgetAmount = 0;
    draft.riskPreference = 'FAST' as never;
    draft.matchId = 'formal-match-id';
    draft.matches[1].draftMatchKey = MATCH_A;
    draft.matches[0].matchDate = '2030-02-30';
    draft.matches[0].homeTeam = '';
    draft.matches[0].kickoffTime = '2030-04-01 19:30 +08:00';
    draft.matches[0].matchId = 'server-match-001';
    draft.markets.push({
      draftMarketKey: '550e8400-e29b-41d4-a716-446655440204',
      draftMatchKey: MATCH_A,
      playType: 'WIN_DRAW_LOSS',
      selection: 'DRAW',
      odds: '2.2',
      evidence: {},
      marketId: 'server-market-001',
    });
    draft.markets.push({
      draftMarketKey: '550e8400-e29b-41d4-a716-446655440205',
      draftMatchKey: '550e8400-e29b-41d4-a716-446655440999',
      playType: 'EXACT_SCORE' as never,
      selection: 'HOME_OR_DRAW' as never,
      odds: '1.0100',
      evidence: {},
    });

    const result = validateReviewDraft(draft);
    const issueCodes = result.issues.map((issue) => issue.code);

    expect(result.valid).toBe(false);
    expect(issueCodes).toEqual(expect.arrayContaining([
      'BUDGET_INVALID',
      'RISK_INVALID',
      'FORMAL_SERVER_ID_FORBIDDEN',
      'DUPLICATE_DRAFT_KEY',
      'MATCH_DATE_INVALID',
      'TEAM_REQUIRED',
      'KICKOFF_INVALID',
      'MARKET_PER_MATCH',
      'ORPHAN_MARKET_MATCH',
      'PLAY_TYPE_INVALID',
      'SELECTION_INVALID',
      'ODDS_INVALID',
    ]));
  });
});
