package org.footballlab.llm.domain;

public record ModelProviderResponse(
        String providerKey,
        String displayName,
        String baseUrl,
        String defaultModel,
        String apiKeyEnvName,
        boolean enabled,
        String credentialStatus,
        String connectionStatus) {
}
