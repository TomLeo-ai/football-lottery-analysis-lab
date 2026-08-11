import type { ConfirmedMarket, ConfirmedMatch } from './ocrWorkflow';
import type { StrategyParameters } from './strategyParameter';

export interface AnalysisGeneratePayload {
  snapshotId: string;
  sourceType: 'USER_SCREENSHOT_CONFIRMED';
  analysisAllowed: boolean;
  riskPreference: string;
  budgetAmount: number;
  currency: string;
  engineMode?: 'MOCK_RULE_ENGINE' | 'OPENAI_COMPATIBLE';
  providerKey?: string;
  modelId?: string;
  promptVersion?: string;
  strategyParameters?: StrategyParameters;
  matches: ConfirmedMatch[];
  markets: ConfirmedMarket[];
}

export interface ProbabilityInsight {
  matchId: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
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
  snapshotId: string;
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
