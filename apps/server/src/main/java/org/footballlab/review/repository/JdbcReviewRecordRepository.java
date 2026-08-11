package org.footballlab.review.repository;

import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.review.domain.ReviewRecordResponse;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcReviewRecordRepository implements ReviewRecordRepository {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcReviewRecordRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void save(ReviewRecordResponse reviewRecord) {
        int updatedRows = jdbcTemplate.update("""
                        update review_record
                        set review_status = ?,
                            match_status = ?,
                            match_confidence = ?,
                            item_settlements_json = ?,
                            failure_reasons_json = ?,
                            strategy_revision_rules_json = ?,
                            result_source_json = ?,
                            supported_settlement_statuses_json = ?,
                            supported_failure_reasons_json = ?,
                            review_engine_type = ?,
                            provider_key = ?,
                            model_id = ?,
                            prompt_version = ?,
                            strategy_parameters_json = ?,
                            llm_insight_json = ?,
                            safety_status = ?,
                            llm_audit_id = ?,
                            payload_json = ?,
                            reviewed_at = ?
                        where plan_id = ?
                        """,
                reviewRecord.reviewStatus(),
                reviewRecord.matchStatus(),
                reviewRecord.matchConfidence(),
                toJson(reviewRecord.itemSettlements()),
                toJson(reviewRecord.failureReasons()),
                toJson(reviewRecord.strategyRevisionRules()),
                toJson(reviewRecord.resultSource()),
                toJson(reviewRecord.supportedSettlementStatuses()),
                toJson(reviewRecord.supportedFailureReasons()),
                reviewRecord.reviewEngineType(),
                reviewRecord.providerKey(),
                reviewRecord.modelId(),
                reviewRecord.promptVersion(),
                toNullableJson(reviewRecord.strategyParameters()),
                toNullableJson(reviewRecord.llmInsight()),
                reviewRecord.safetyStatus(),
                reviewRecord.llmAuditId(),
                toJson(reviewRecord),
                reviewRecord.reviewedAt(),
                reviewRecord.planId());

        if (updatedRows == 0) {
            jdbcTemplate.update("""
                            insert into review_record (
                                plan_id,
                                review_status,
                                match_status,
                                match_confidence,
                                item_settlements_json,
                                failure_reasons_json,
                                strategy_revision_rules_json,
                                result_source_json,
                                supported_settlement_statuses_json,
                                supported_failure_reasons_json,
                                review_engine_type,
                                provider_key,
                                model_id,
                                prompt_version,
                                strategy_parameters_json,
                                llm_insight_json,
                                safety_status,
                                llm_audit_id,
                                payload_json,
                                reviewed_at
                            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                    reviewRecord.planId(),
                    reviewRecord.reviewStatus(),
                    reviewRecord.matchStatus(),
                    reviewRecord.matchConfidence(),
                    toJson(reviewRecord.itemSettlements()),
                    toJson(reviewRecord.failureReasons()),
                    toJson(reviewRecord.strategyRevisionRules()),
                    toJson(reviewRecord.resultSource()),
                    toJson(reviewRecord.supportedSettlementStatuses()),
                    toJson(reviewRecord.supportedFailureReasons()),
                    reviewRecord.reviewEngineType(),
                    reviewRecord.providerKey(),
                    reviewRecord.modelId(),
                    reviewRecord.promptVersion(),
                    toNullableJson(reviewRecord.strategyParameters()),
                    toNullableJson(reviewRecord.llmInsight()),
                    reviewRecord.safetyStatus(),
                    reviewRecord.llmAuditId(),
                    toJson(reviewRecord),
                    reviewRecord.reviewedAt());
        }
    }

    @Override
    public Optional<ReviewRecordResponse> findByPlanId(String planId) {
        try {
            String payload = jdbcTemplate.queryForObject(
                    "select payload_json from review_record where plan_id = ?",
                    String.class,
                    planId);
            return Optional.of(fromJson(payload));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    @Override
    public boolean existsByPlanId(String planId) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(1) from review_record where plan_id = ?",
                Integer.class,
                planId);
        return count != null && count > 0;
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize review record payload.", exception);
        }
    }

    private String toNullableJson(Object value) {
        return value == null ? null : toJson(value);
    }

    private ReviewRecordResponse fromJson(String value) {
        try {
            return objectMapper.readValue(value, ReviewRecordResponse.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize review record payload.", exception);
        }
    }
}
