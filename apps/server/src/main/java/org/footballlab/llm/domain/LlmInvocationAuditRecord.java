package org.footballlab.llm.domain;

public record LlmInvocationAuditRecord(
        String auditId,
        String businessType,
        String businessId,
        String providerKey,
        String modelId,
        String promptVersion,
        String inputHash,
        String outputHash,
        Integer promptTokens,
        Integer completionTokens,
        Integer totalTokens,
        Long latencyMs,
        String safetyStatus,
        String errorCode,
        String createdAt) {
}
