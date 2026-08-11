package org.footballlab.llm.domain;

public record LlmHttpResponse(
        int statusCode,
        String body,
        long latencyMs) {
}
