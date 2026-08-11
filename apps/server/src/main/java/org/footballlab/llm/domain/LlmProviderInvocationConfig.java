package org.footballlab.llm.domain;

public record LlmProviderInvocationConfig(
        String providerKey,
        String baseUrl,
        String modelId,
        String apiKeyEnvName,
        String apiKey) {
}
