package org.footballlab.llm.domain;

public record LlmChatRequest(
        String providerKey,
        String baseUrl,
        String apiKey,
        String modelId,
        String systemPrompt,
        String userPrompt) {
}
