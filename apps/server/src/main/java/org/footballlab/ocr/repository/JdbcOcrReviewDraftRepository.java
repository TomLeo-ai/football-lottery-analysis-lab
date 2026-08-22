package org.footballlab.ocr.repository;

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
}
