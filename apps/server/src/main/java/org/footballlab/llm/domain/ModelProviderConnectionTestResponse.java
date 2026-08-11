package org.footballlab.llm.domain;

public record ModelProviderConnectionTestResponse(
        String providerKey,
        String modelId,
        String connectionStatus,
        long latencyMs,
        String errorType) {
}
