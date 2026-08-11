package org.footballlab.llm.domain;

public record LlmChatResponse(
        String content,
        int promptTokens,
        int completionTokens,
        int totalTokens,
        long latencyMs) {
}
