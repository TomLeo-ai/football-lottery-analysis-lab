package org.footballlab.analysis.domain;

public record ResolvedAnalysisEngineConfiguration(
        String engineMode,
        String providerKey,
        String modelId,
        String promptVersion) {
}
