export interface ModelProvider {
  providerKey: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyEnvName: string;
  enabled: boolean;
  credentialStatus: 'CONFIGURED' | 'MISSING';
  connectionStatus: 'UNTESTED' | 'SKIPPED' | 'NOT_EXECUTED' | 'FAILED' | 'CONNECTED';
}

export interface ModelProviderConnectionTest {
  providerKey: string;
  modelId: string;
  connectionStatus: string;
  latencyMs: number;
  errorType: string;
}

export interface EngineSettings {
  defaultEngineMode: 'MOCK_RULE_ENGINE';
  analysisEngineMode: 'MOCK_RULE_ENGINE' | 'OPENAI_COMPATIBLE';
  reviewInsightMode: 'RULE_REVIEW_ONLY' | 'RULE_REVIEW_WITH_LLM_INSIGHT';
}

export interface EngineSettingsUpdatePayload {
  analysisEngineMode?: EngineSettings['analysisEngineMode'];
  reviewInsightMode?: EngineSettings['reviewInsightMode'];
}
