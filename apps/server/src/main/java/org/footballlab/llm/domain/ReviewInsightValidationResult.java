package org.footballlab.llm.domain;

import com.fasterxml.jackson.databind.JsonNode;

public record ReviewInsightValidationResult(
        JsonNode output,
        String safetyStatus) {
}
