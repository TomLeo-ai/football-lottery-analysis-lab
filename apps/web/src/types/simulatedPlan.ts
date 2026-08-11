import type { AnalysisReport, ProbabilityInsight, RiskWarning, SimulatedSelection } from './analysis';
import type { StrategyParameters } from './strategyParameter';

export interface StrategySimulationPayload {
  reportId: string;
  snapshotId: string;
  inputSourceType: string;
  engineType: string;
  reportStatus: string;
  currency?: string;
  budgetAmount?: number;
  strategyParameters?: StrategyParameters | null;
  probabilityAnalysis: ProbabilityInsight[];
  riskWarnings: RiskWarning[];
  simulatedSelections: SimulatedSelection[];
}

export interface SimulatedPlanSavePayload {
  generatedPlanId: string;
  operatorNote: string;
}

export interface SimulatedPlanItem {
  planItemId: string;
  matchId: string;
  matchDate?: string | null;
  league?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  kickoffTime?: string | null;
  playType: string;
  selection: string;
  odds: number;
  stakeAmount: number;
  itemStatus: string;
  note?: string;
}

export interface SimulatedPlanSnapshot {
  planSnapshotId?: string;
  snapshotId: string;
  reportId: string;
  inputSourceType: string;
  engineType: string;
  sourceReportStatus: string;
  strategyParameters?: StrategyParameters | null;
  selectionCount: number;
  snapshotStatus: string;
  capturedAt?: string;
}

export interface SimulatedPlan {
  planId: string;
  planType: string;
  planStatus: string;
  reportId: string;
  snapshotId?: string;
  currency?: string | null;
  budgetAmount?: number | null;
  strategyParameters?: StrategyParameters | null;
  statusFlow: string[];
  items: SimulatedPlanItem[];
  snapshot: SimulatedPlanSnapshot;
  complianceNotice: string;
  operatorNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toStrategySimulationPayload(report: AnalysisReport): StrategySimulationPayload {
  return {
    reportId: report.reportId,
    snapshotId: report.snapshotId,
    inputSourceType: report.inputSourceType,
    engineType: report.engineType,
    reportStatus: report.reportStatus,
    currency: report.strategyParameters?.currency,
    budgetAmount: report.strategyParameters?.budgetAmount,
    strategyParameters: report.strategyParameters ?? null,
    probabilityAnalysis: report.probabilityAnalysis,
    riskWarnings: report.riskWarnings,
    simulatedSelections: report.simulatedSelections
  };
}
