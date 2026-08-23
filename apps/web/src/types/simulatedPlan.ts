import type { StrategyParameters } from './strategyParameter';

export interface StrategySimulationPayload {
  reportId: string;
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
