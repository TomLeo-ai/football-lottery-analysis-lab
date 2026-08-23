import type { StrategyParameters } from './strategyParameter';

export interface AnalysisOptions {
  targetTicketCount?: number;
  minTicketCount?: number;
  maxTicketCount?: number;
  mainTicketRatio?: number;
  defensiveTicketRatio?: number;
  entertainmentTicketRatio?: number;
  enableEntertainmentTicket?: boolean;
  entertainmentTicketMaxCost?: number;
  maxParlayLegs?: number;
  minPayoutRequirement?: number | null;
  allowLowReturnTicket?: boolean;
  upsetCoverageLevel?: 'NONE' | 'LIGHT' | 'BALANCED' | 'STRONG';
}

interface AnalysisGenerateBase {
  snapshotId: string;
  analysisOptions: AnalysisOptions | null;
}

export interface MockAnalysisGeneratePayload extends AnalysisGenerateBase {
  engineMode: 'MOCK_RULE_ENGINE';
}

export interface LlmAnalysisGeneratePayload extends AnalysisGenerateBase {
  engineMode: 'OPENAI_COMPATIBLE';
  providerKey: string;
  modelId: string;
  promptVersion: 'danche-prediction-v1';
}

export type AnalysisGeneratePayload = MockAnalysisGeneratePayload | LlmAnalysisGeneratePayload;

export interface ProbabilityInsight {
  matchId: string;
  matchDate?: string;
  league?: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime?: string;
  selection: string;
  probabilityBand: string;
  rationale: string;
}

export interface RiskWarning {
  riskCode: string;
  riskLevel: string;
  message: string;
}

export interface SimulatedSelection {
  matchId: string;
  playType: string;
  selection: string;
  odds: number;
  stakeAmount: number;
  note: string;
}

export interface AnalysisReport {
  reportId: string;
  workflowId: string;
  snapshotId: string;
  authorityType: string;
  schemaVersion: 'ANALYSIS_REPORT_V2' | 'LEGACY_V1';
  strategyDefaultsVersion: string | null;
  authorityRevision: number | null;
  inputSourceType: string;
  engineType: string;
  reportStatus: string;
  strategyParameters?: StrategyParameters | null;
  probabilityAnalysis: ProbabilityInsight[];
  riskWarnings: RiskWarning[];
  simulatedSelections: SimulatedSelection[];
  complianceNotice: string;
  generatedAt: string;
  providerKey?: string | null;
  modelId?: string | null;
  promptVersion?: string | null;
  safetyStatus?: string | null;
  llmAuditId?: string | null;
  llmOutput?: unknown;
}
