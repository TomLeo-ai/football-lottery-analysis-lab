import { describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@/api/http';

import * as ocrWorkflowApi from './ocrWorkflow';
import {
  abandonOcrWorkflow,
  confirmOcrReviewDraft,
  createOcrWorkflow,
  parseOcrCandidates,
  saveOcrReviewDraft,
} from './ocrWorkflow';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(body, status)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('ocr workflow API client', () => {
  it('loads a persisted review draft through the encoded read-only endpoint', async () => {
    const fetchMock = stubFetch({
      code: 200,
      msg: 'success',
      data: {
        ocrTaskId: 'ocr/task 001',
        workflowId: 'workflow-001',
        revision: 2,
        draftStatus: 'ACTIVE',
        riskPreference: 'BALANCED',
        budgetAmount: 20,
        currency: 'CNY',
        matches: [],
        markets: [],
        schemaVersion: 'OCR_REVIEW_DRAFT_V2',
        updatedAt: '2026-08-24T00:00:00Z',
      },
    });
    const api = ocrWorkflowApi as typeof ocrWorkflowApi & {
      getOcrReviewDraft: (ocrTaskId: string) => Promise<unknown>;
    };

    expect(api.getOcrReviewDraft).toBeTypeOf('function');
    await api.getOcrReviewDraft('ocr/task 001');

    expect(fetchMock).toHaveBeenCalledWith('/api/ocr/review-drafts/ocr%2Ftask%20001', {
      method: 'GET',
      headers: {},
      body: undefined,
    });
  });

  it('creates a v2 workflow with an exact minimized request shape and idempotency key', async () => {
    const fetchMock = stubFetch({
      code: 201,
      msg: 'success',
      data: {
        workflowId: 'workflow-001',
        currentStage: 'WAITING_LOCAL_OCR',
        version: 0,
        screenshotTaskId: 'screenshot-001',
        currentOcrTaskId: null,
        confirmedSnapshotId: null,
        currentReportId: null,
        currentPlanId: null,
        createdAt: '2026-08-22T12:00:00+08:00',
        updatedAt: '2026-08-22T12:00:00+08:00',
      },
    }, 201);

    await createOcrWorkflow({
      sourceDeclaration: 'FICTIONAL_SAMPLE',
      sourcePolicyVersion: 'SOURCE_POLICY_V2',
      contentType: 'image/png',
      byteSize: 1234,
      width: 1200,
      height: 800,
    }, '550e8400-e29b-41d4-a716-446655440000');

    expect(fetchMock).toHaveBeenCalledWith('/api/ocr/workflows', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000',
      },
      body: JSON.stringify({
        sourceDeclaration: 'FICTIONAL_SAMPLE',
        sourcePolicyVersion: 'SOURCE_POLICY_V2',
        contentType: 'image/png',
        byteSize: 1234,
        width: 1200,
        height: 800,
      }),
    });
    expect(lastBody(fetchMock)).not.toHaveProperty('fileName');
    expect(lastBody(fetchMock)).not.toHaveProperty('image');
    expect(lastBody(fetchMock)).not.toHaveProperty('rawText');
  });

  it('sends parse, save, confirm, and abandon requests to the strict v2 endpoints', async () => {
    const fetchMock = stubFetch({ code: 200, msg: 'success', data: {} });

    await parseOcrCandidates('workflow-001', {
      expectedVersion: 0,
      entryMode: 'OCR',
      replaceDraft: false,
      ocrEngine: 'TESSERACT_BROWSER',
      ocrEngineVersion: '7.0.0',
      languages: ['eng'],
      processedWidth: 1200,
      processedHeight: 800,
      candidateFields: [
        {
          fieldId: '550e8400-e29b-41d4-a716-446655440001',
          scope: 'MATCH',
          fieldName: 'league',
          value: 'Fictional League',
          confidence: 0.9,
          boundingBox: { x: 1, y: 2, width: 3, height: 4 },
        },
      ],
    }, '550e8400-e29b-41d4-a716-446655440002');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/ocr/workflows/workflow-001/ocr-candidates');
    expect(Object.keys(lastBody(fetchMock))).toEqual([
      'expectedVersion',
      'entryMode',
      'replaceDraft',
      'ocrEngine',
      'ocrEngineVersion',
      'languages',
      'processedWidth',
      'processedHeight',
      'candidateFields',
    ]);
    expect(JSON.stringify(lastBody(fetchMock))).not.toMatch(/rawText|words|fileName|image/i);

    await saveOcrReviewDraft('ocr-001', {
      expectedRevision: 0,
      riskPreference: 'BALANCED',
      budgetAmount: 30,
      currency: 'CNY',
      matches: [
        {
          matchId: 'match-001',
          matchDate: '2026-08-22',
          league: 'Fictional League',
          homeTeam: 'Northport United',
          awayTeam: 'Lakeside City',
          kickoffTime: '2026-08-22T12:00:00Z',
        },
      ],
      markets: [
        {
          marketId: 'market-001',
          matchId: 'match-001',
          playType: 'WIN_DRAW_LOSS',
          selection: 'HOME_WIN',
          odds: 2.05,
        },
      ],
    }, '550e8400-e29b-41d4-a716-446655440003');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/ocr/review-drafts/ocr-001');
    expect(Object.keys(lastBody(fetchMock))).toEqual([
      'expectedRevision',
      'riskPreference',
      'budgetAmount',
      'currency',
      'matches',
      'markets',
    ]);

    await confirmOcrReviewDraft('ocr-001', { expectedRevision: 1 }, '550e8400-e29b-41d4-a716-446655440004');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/ocr/review-drafts/ocr-001/confirm');
    expect(lastBody(fetchMock)).toEqual({ expectedRevision: 1 });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await abandonOcrWorkflow('workflow-001', '550e8400-e29b-41d4-a716-446655440005');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/ocr/workflows/workflow-001');
    expect(fetchMock.mock.calls.at(-1)?.[1]).toMatchObject({
      method: 'DELETE',
      headers: {
        'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440005',
      },
    });
  });

  it('throws typed safe API errors without exposing request bodies', async () => {
    stubFetch({
      code: 409,
      msg: 'error',
      error: {
        errorCode: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used.',
        traceId: 'trace-001',
        fieldErrors: [{ fieldPath: 'Idempotency-Key', message: 'already used' }],
        recovery: { idempotencyKey: '550e8400-e29b-41d4-a716-446655440000' },
      },
    }, 409);

    await expect(createOcrWorkflow({
      sourceDeclaration: 'FICTIONAL_SAMPLE',
      sourcePolicyVersion: 'SOURCE_POLICY_V2',
      contentType: 'image/png',
      byteSize: 1234,
      width: 1200,
      height: 800,
    }, '550e8400-e29b-41d4-a716-446655440000')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 409,
      errorCode: 'IDEMPOTENCY_KEY_REUSED',
      traceId: 'trace-001',
    } satisfies Partial<ApiRequestError>);
  });
});
