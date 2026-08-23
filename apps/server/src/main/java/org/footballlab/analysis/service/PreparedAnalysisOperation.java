package org.footballlab.analysis.service;

import java.util.Objects;

import org.footballlab.analysis.domain.ResolvedAnalysisEngineConfiguration;
import org.footballlab.strategy.domain.StrategyParameterRequest;

public record PreparedAnalysisOperation(
        String idempotencyKey,
        String workflowId,
        long claimedWorkflowVersion,
        long snapshotRevision,
        String reportId,
        String generatedAt,
        AuthoritativeAnalysisInput input,
        ResolvedAnalysisEngineConfiguration engineConfiguration,
        StrategyParameterRequest strategyParameters,
        String defaultsVersion,
        String requestHash) {

    public PreparedAnalysisOperation {
        Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        Objects.requireNonNull(workflowId, "workflowId");
        Objects.requireNonNull(reportId, "reportId");
        Objects.requireNonNull(generatedAt, "generatedAt");
        Objects.requireNonNull(input, "input");
        Objects.requireNonNull(engineConfiguration, "engineConfiguration");
        Objects.requireNonNull(strategyParameters, "strategyParameters");
        Objects.requireNonNull(defaultsVersion, "defaultsVersion");
        Objects.requireNonNull(requestHash, "requestHash");
    }

    public AnalysisEngineContext toEngineContext() {
        return new AnalysisEngineContext(reportId, generatedAt, input, engineConfiguration, strategyParameters);
    }
}
