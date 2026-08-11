package org.footballlab.llm.domain;

import com.fasterxml.jackson.databind.JsonNode;

public record PredictionValidationResult(
        JsonNode output,
        String safetyStatus) {
}
