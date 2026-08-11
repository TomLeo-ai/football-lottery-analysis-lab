export type RiskPreference = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';
export type ExactScorePolicy = 'DISABLED' | 'ENTERTAINMENT_ONLY' | 'ALLOWED_WITH_REASON';
export type UpsetCoverageLevel = 'NONE' | 'LIGHT' | 'BALANCED' | 'STRONG';

export interface StrategyParameters {
  budgetAmount: number;
  currency: string;
  targetTicketCount: number;
  minTicketCount: number;
  maxTicketCount: number;
  riskPreference: RiskPreference;
  mainTicketRatio: number;
  defensiveTicketRatio: number;
  entertainmentTicketRatio: number;
  enableEntertainmentTicket: boolean;
  entertainmentTicketMaxCost: number;
  maxParlayLegs: number;
  preferredPlayTypes: string[];
  excludedPlayTypes: string[];
  exactScorePolicy: ExactScorePolicy;
  minPayoutRequirement: number | null;
  allowLowReturnTicket: boolean;
  upsetCoverageLevel: UpsetCoverageLevel;
}
