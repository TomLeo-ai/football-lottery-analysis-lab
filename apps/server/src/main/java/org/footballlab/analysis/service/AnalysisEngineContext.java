package org.footballlab.analysis.service;

import org.footballlab.analysis.domain.ResolvedAnalysisEngineConfiguration;
import org.footballlab.strategy.domain.StrategyParameterRequest;

public record AnalysisEngineContext(
        String reportId,
        String generatedAt,
        AuthoritativeAnalysisInput input,
        ResolvedAnalysisEngineConfiguration engineConfiguration,
        StrategyParameterRequest strategyParameters) {
}
