package org.footballlab.review.domain;

import java.math.BigDecimal;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import org.footballlab.strategy.domain.StrategyParameterRequest;

public record ReviewRecordResponse(
        String planId,
        String reviewStatus,
        String matchStatus,
        BigDecimal matchConfidence,
        List<ItemSettlementResponse> itemSettlements,
        List<String> failureReasons,
        List<StrategyRevisionRuleResponse> strategyRevisionRules,
        ResultSourceResponse resultSource,
        List<String> supportedSettlementStatuses,
        List<String> supportedFailureReasons,
        String reviewedAt,
        StrategyParameterRequest strategyParameters,
        String reviewEngineType,
        String providerKey,
        String modelId,
        String promptVersion,
        String safetyStatus,
        String llmAuditId,
        JsonNode llmInsight) {

    public static final String RULE_REVIEW_ONLY = "RULE_REVIEW_ONLY";

    public ReviewRecordResponse {
        if (reviewEngineType == null || reviewEngineType.isBlank()) {
            reviewEngineType = RULE_REVIEW_ONLY;
        }
        if (llmInsight != null && llmInsight.isNull()) {
            llmInsight = null;
        }
    }

    public ReviewRecordResponse(
            String planId,
            String reviewStatus,
            String matchStatus,
            BigDecimal matchConfidence,
            List<ItemSettlementResponse> itemSettlements,
            List<String> failureReasons,
            List<StrategyRevisionRuleResponse> strategyRevisionRules,
            ResultSourceResponse resultSource,
            List<String> supportedSettlementStatuses,
            List<String> supportedFailureReasons,
            String reviewedAt) {
        this(
                planId,
                reviewStatus,
                matchStatus,
                matchConfidence,
                itemSettlements,
                failureReasons,
                strategyRevisionRules,
                resultSource,
                supportedSettlementStatuses,
                supportedFailureReasons,
                reviewedAt,
                null,
                RULE_REVIEW_ONLY,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    public ReviewRecordResponse withReviewInsight(ReviewInsightResponse insight) {
        return new ReviewRecordResponse(
                planId,
                reviewStatus,
                matchStatus,
                matchConfidence,
                itemSettlements,
                failureReasons,
                strategyRevisionRules,
                resultSource,
                supportedSettlementStatuses,
                supportedFailureReasons,
                reviewedAt,
                strategyParameters,
                insight.reviewEngineType(),
                insight.providerKey(),
                insight.modelId(),
                insight.promptVersion(),
                insight.safetyStatus(),
                insight.llmAuditId(),
                insight.llmInsight());
    }
}
