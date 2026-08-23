package org.footballlab.llm.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.UUID;

import org.footballlab.llm.domain.LlmChatResponse;
import org.footballlab.llm.domain.LlmInvocationAuditRecord;
import org.footballlab.llm.domain.LlmProviderInvocationConfig;
import org.footballlab.llm.repository.LlmInvocationAuditRepository;
import org.springframework.stereotype.Service;

@Service
public class LlmInvocationAuditService {

    public static final String BUSINESS_ANALYSIS_PREDICTION = "ANALYSIS_PREDICTION";
    public static final String BUSINESS_REVIEW_INSIGHT = "REVIEW_INSIGHT";
    public static final String SAFETY_PASSED = "PASSED";
    public static final String SAFETY_BLOCKED = "BLOCKED";
    public static final String SAFETY_ERROR = "ERROR";

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final String AUDIT_PREFIX = "llm-audit-";
    private static final int ERROR_CODE_MAX_LENGTH = 128;

    private final LlmInvocationAuditRepository auditRepository;

    public LlmInvocationAuditService(LlmInvocationAuditRepository auditRepository) {
        this.auditRepository = auditRepository;
    }

    public String recordSuccess(
            String businessType,
            String businessId,
            LlmProviderInvocationConfig provider,
            String promptVersion,
            String inputPayload,
            LlmChatResponse response,
            String safetyStatus) {
        return save(buildSuccessRecord(
                businessType, businessId, provider, promptVersion, inputPayload, response, safetyStatus));
    }

    public LlmInvocationAuditRecord buildSuccessRecord(
            String businessType,
            String businessId,
            LlmProviderInvocationConfig provider,
            String promptVersion,
            String inputPayload,
            LlmChatResponse response,
            String safetyStatus) {
        return new LlmInvocationAuditRecord(
                nextAuditId(),
                businessType,
                businessId,
                provider.providerKey(),
                provider.modelId(),
                promptVersion,
                sha256(inputPayload),
                sha256(response.content()),
                response.promptTokens(),
                response.completionTokens(),
                response.totalTokens(),
                response.latencyMs(),
                normalizeSafetyStatus(safetyStatus, SAFETY_PASSED),
                null,
                now());
    }

    public String recordFailure(
            String businessType,
            String businessId,
            LlmProviderInvocationConfig provider,
            String promptVersion,
            String inputPayload,
            String outputPayload,
            Integer promptTokens,
            Integer completionTokens,
            Integer totalTokens,
            Long latencyMs,
            String safetyStatus,
            String errorCode) {
        return save(buildFailureRecord(
                businessType, businessId, provider, promptVersion, inputPayload, outputPayload,
                promptTokens, completionTokens, totalTokens, latencyMs, safetyStatus, errorCode));
    }

    public LlmInvocationAuditRecord buildFailureRecord(
            String businessType,
            String businessId,
            LlmProviderInvocationConfig provider,
            String promptVersion,
            String inputPayload,
            String outputPayload,
            Integer promptTokens,
            Integer completionTokens,
            Integer totalTokens,
            Long latencyMs,
            String safetyStatus,
            String errorCode) {
        return new LlmInvocationAuditRecord(
                nextAuditId(),
                businessType,
                businessId,
                provider.providerKey(),
                provider.modelId(),
                promptVersion,
                sha256(inputPayload),
                outputPayload == null ? null : sha256(outputPayload),
                promptTokens,
                completionTokens,
                totalTokens,
                latencyMs,
                normalizeSafetyStatus(safetyStatus, SAFETY_ERROR),
                normalizeErrorCode(errorCode),
                now());
    }

    private String save(LlmInvocationAuditRecord auditRecord) {
        auditRepository.save(auditRecord);
        return auditRecord.auditId();
    }

    private String nextAuditId() {
        return AUDIT_PREFIX + UUID.randomUUID().toString().replace("-", "");
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 digest is not available.", exception);
        }
    }

    private String normalizeSafetyStatus(String safetyStatus, String fallback) {
        return safetyStatus == null || safetyStatus.isBlank() ? fallback : safetyStatus;
    }

    private String normalizeErrorCode(String errorCode) {
        if (errorCode == null || errorCode.isBlank()) {
            return null;
        }
        String normalized = errorCode.replace('\r', ' ').replace('\n', ' ').trim();
        if (normalized.length() <= ERROR_CODE_MAX_LENGTH) {
            return normalized;
        }
        return normalized.substring(0, ERROR_CODE_MAX_LENGTH);
    }

    private String now() {
        return OffsetDateTime.now(DEFAULT_ZONE).toString();
    }
}
