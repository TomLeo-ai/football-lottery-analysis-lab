package org.footballlab.review.domain;

import com.fasterxml.jackson.databind.JsonNode;

public record ReviewInsightResponse(
        String reviewEngineType,
        String providerKey,
        String modelId,
        String promptVersion,
        String safetyStatus,
        String llmAuditId,
        JsonNode llmInsight) {
}
