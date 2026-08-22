package org.footballlab.ocr.repository;

import java.math.BigDecimal;
import java.util.Optional;

public interface OcrReviewDraftRepository {

    void saveInitialDraft(
            String ocrTaskId,
            String workflowId,
            String matchesJson,
            String marketsJson,
            String updatedAt);

    boolean existsActiveDraft(String workflowId);

    Optional<DraftRecord> findActiveDraft(String ocrTaskId);

    boolean updateDraft(
            String ocrTaskId,
            String workflowId,
            long expectedRevision,
            String riskPreference,
            BigDecimal budgetAmount,
            String currency,
            String matchesJson,
            String marketsJson,
            String updatedAt);

    record DraftRecord(
            String ocrTaskId,
            String workflowId,
            long revision,
            String draftStatus,
            String riskPreference,
            BigDecimal budgetAmount,
            String currency,
            String matchesJson,
            String marketsJson,
            String schemaVersion,
            String updatedAt
    ) {
    }
}
