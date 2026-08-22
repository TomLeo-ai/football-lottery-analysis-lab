package org.footballlab.ocr.repository;

import java.math.BigDecimal;
import java.util.Optional;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcOcrReviewDraftRepository implements OcrReviewDraftRepository {

    private final JdbcTemplate jdbcTemplate;

    public JdbcOcrReviewDraftRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void saveInitialDraft(
            String ocrTaskId,
            String workflowId,
            String matchesJson,
            String marketsJson,
            String updatedAt
    ) {
        jdbcTemplate.update("""
                        insert into ocr_review_draft (
                            ocr_task_id,
                            workflow_id,
                            revision,
                            draft_status,
                            matches_json,
                            markets_json,
                            schema_version,
                            updated_at
                        ) values (?, ?, 0, 'ACTIVE', ?, ?, 'OCR_REVIEW_DRAFT_V2', ?)
                        """,
                ocrTaskId,
                workflowId,
                matchesJson,
                marketsJson,
                updatedAt);
    }

    @Override
    public boolean existsActiveDraft(String workflowId) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from ocr_review_draft where workflow_id = ? and draft_status = 'ACTIVE'",
                Integer.class,
                workflowId);
        return count != null && count > 0;
    }

    @Override
    public Optional<DraftRecord> findActiveDraft(String ocrTaskId) {
        try {
            return Optional.ofNullable(jdbcTemplate.queryForObject("""
                            select ocr_task_id,
                                   workflow_id,
                                   revision,
                                   draft_status,
                                   risk_preference,
                                   budget_amount,
                                   currency,
                                   matches_json,
                                   markets_json,
                                   schema_version,
                                   updated_at
                            from ocr_review_draft
                            where ocr_task_id = ?
                              and draft_status = 'ACTIVE'
                            """,
                    (resultSet, rowNumber) -> new DraftRecord(
                            resultSet.getString("ocr_task_id"),
                            resultSet.getString("workflow_id"),
                            resultSet.getLong("revision"),
                            resultSet.getString("draft_status"),
                            resultSet.getString("risk_preference"),
                            resultSet.getBigDecimal("budget_amount"),
                            resultSet.getString("currency"),
                            resultSet.getString("matches_json"),
                            resultSet.getString("markets_json"),
                            resultSet.getString("schema_version"),
                            resultSet.getString("updated_at")),
                    ocrTaskId));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    @Override
    public boolean updateDraft(
            String ocrTaskId,
            String workflowId,
            long expectedRevision,
            String riskPreference,
            BigDecimal budgetAmount,
            String currency,
            String matchesJson,
            String marketsJson,
            String updatedAt
    ) {
        int updatedRows = jdbcTemplate.update("""
                        update ocr_review_draft
                        set revision = revision + 1,
                            risk_preference = ?,
                            budget_amount = ?,
                            currency = ?,
                            matches_json = ?,
                            markets_json = ?,
                            updated_at = ?
                        where ocr_task_id = ?
                          and workflow_id = ?
                          and revision = ?
                          and draft_status = 'ACTIVE'
                        """,
                riskPreference,
                budgetAmount,
                currency,
                matchesJson,
                marketsJson,
                updatedAt,
                ocrTaskId,
                workflowId,
                expectedRevision);
        return updatedRows == 1;
    }
}
