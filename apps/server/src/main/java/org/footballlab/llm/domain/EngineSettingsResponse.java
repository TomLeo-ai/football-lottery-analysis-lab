package org.footballlab.llm.domain;

public record EngineSettingsResponse(
        String defaultEngineMode,
        String analysisEngineMode,
        String reviewInsightMode) {
}
