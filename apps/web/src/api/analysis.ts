import { requestJson } from '@/api/http';
import type {
  AnalysisGeneratePayload,
  AnalysisOptions,
  AnalysisReport,
  LlmAnalysisGeneratePayload,
  MockAnalysisGeneratePayload,
} from '@/types/analysis';

function normalizeAnalysisOptions(options: AnalysisOptions | null): AnalysisOptions | null {
  if (options === null) return null;
  return {
    ...(options.targetTicketCount === undefined ? {} : { targetTicketCount: options.targetTicketCount }),
    ...(options.minTicketCount === undefined ? {} : { minTicketCount: options.minTicketCount }),
    ...(options.maxTicketCount === undefined ? {} : { maxTicketCount: options.maxTicketCount }),
    ...(options.mainTicketRatio === undefined ? {} : { mainTicketRatio: options.mainTicketRatio }),
    ...(options.defensiveTicketRatio === undefined ? {} : { defensiveTicketRatio: options.defensiveTicketRatio }),
    ...(options.entertainmentTicketRatio === undefined ? {} : { entertainmentTicketRatio: options.entertainmentTicketRatio }),
    ...(options.enableEntertainmentTicket === undefined ? {} : { enableEntertainmentTicket: options.enableEntertainmentTicket }),
    ...(options.entertainmentTicketMaxCost === undefined ? {} : { entertainmentTicketMaxCost: options.entertainmentTicketMaxCost }),
    ...(options.maxParlayLegs === undefined ? {} : { maxParlayLegs: options.maxParlayLegs }),
    ...(options.minPayoutRequirement === undefined ? {} : { minPayoutRequirement: options.minPayoutRequirement }),
    ...(options.allowLowReturnTicket === undefined ? {} : { allowLowReturnTicket: options.allowLowReturnTicket }),
    ...(options.upsetCoverageLevel === undefined ? {} : { upsetCoverageLevel: options.upsetCoverageLevel }),
  };
}

export function normalizeAnalysisGeneratePayload(
  payload: AnalysisGeneratePayload,
): AnalysisGeneratePayload {
  const base = {
    snapshotId: payload.snapshotId,
    engineMode: payload.engineMode,
    analysisOptions: normalizeAnalysisOptions(payload.analysisOptions),
  };
  if (payload.engineMode === 'MOCK_RULE_ENGINE') {
    return base as MockAnalysisGeneratePayload;
  }
  return {
    ...base,
    providerKey: payload.providerKey.trim(),
    modelId: payload.modelId.trim(),
    promptVersion: payload.promptVersion,
  } as LlmAnalysisGeneratePayload;
}

export function generateAnalysis(
  payload: AnalysisGeneratePayload,
  idempotencyKey: string,
): Promise<AnalysisReport> {
  return requestJson<AnalysisReport>('/api/analysis/generate', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: normalizeAnalysisGeneratePayload(payload),
  });
}

export function getAnalysisReport(reportId: string): Promise<AnalysisReport> {
  return requestJson<AnalysisReport>(`/api/analysis/reports/${encodeURIComponent(reportId)}`);
}
