package org.footballlab.analysis.service;

import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.strategy.domain.StrategyParameterRequest;

public record AnalysisEngineContext(
        String reportId,
        String generatedAt,
        AnalysisGenerateRequest request,
        StrategyParameterRequest strategyParameters) {
}
