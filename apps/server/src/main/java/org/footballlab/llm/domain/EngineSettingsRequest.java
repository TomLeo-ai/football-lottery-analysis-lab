package org.footballlab.llm.domain;

public record EngineSettingsRequest(
        String analysisEngineMode,
        String reviewInsightMode) {
}
