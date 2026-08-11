export interface PendingReviewPlan {
  planId: string;
  planStatus: string;
  reportId: string;
  itemCount: number;
  updatedAt: string;
}

export interface ResultMatchCandidate {
  candidateId: string;
  planItemId: string;
  resultSnapshotId: string;
  matchId: string;
  matchStatus: string;
  confidence: number;
  sourceName: string;
  sourceUrl: string;
  sourceLicense: string;
  fetchedAt: string;
}

export interface ResultMatch {
  planId: string;
  matchStatus: string;
  matchConfidence: number;
  candidates: ResultMatchCandidate[];
  reviewWarnings?: string[];
}

export interface ResultSource {
  sourceName: string;
  sourceUrl: string;
  sourceLicense: string;
  fetchedAt: string;
  confidence: number;
}

export interface ItemSettlement {
  planItemId: string;
  matchId: string;
  selection: string;
  actualOutcome: string | null;
  settlementStatus: string;
  failureReason: string | null;
}

export interface StrategyRevisionRule {
  ruleCode: string;
  reasonCode: string;
  suggestion: string;
}

export interface TicketReviewNarrative {
  planItemId?: string;
  narrative?: string;
}

export interface FailureClassification {
  reasonCode?: string;
  category?: string;
  explanation?: string;
}

export interface ReviewStrategyRevisionSuggestion {
  ruleCode?: string;
  suggestion?: string;
}

export interface ReviewInsight {
  settlementAuthorityNotice?: string;
  ticketReviewNarratives?: TicketReviewNarrative[];
  failureClassifications?: FailureClassification[];
  strategyRevisionSuggestions?: ReviewStrategyRevisionSuggestion[];
  nextRoundParameterSuggestions?: Record<string, unknown>;
  doNotOverreactEvents?: string[];
  complianceNotice?: string;
}

export interface ReviewRecord {
  planId: string;
  reviewStatus: string;
  matchStatus: string;
  matchConfidence: number;
  itemSettlements: ItemSettlement[];
  failureReasons: string[];
  strategyRevisionRules: StrategyRevisionRule[];
  resultSource: ResultSource | null;
  supportedSettlementStatuses: string[];
  supportedFailureReasons: string[];
  reviewedAt: string;
  reviewEngineType?: string;
  providerKey?: string | null;
  modelId?: string | null;
  promptVersion?: string | null;
  safetyStatus?: string | null;
  llmAuditId?: string | null;
  llmInsight?: ReviewInsight | null;
}

export interface ReviewSettlePayload {
  reviewEngineMode: 'RULE_REVIEW_ONLY' | 'RULE_REVIEW_WITH_LLM_INSIGHT';
  providerKey?: string;
  modelId?: string;
  promptVersion?: string;
}
