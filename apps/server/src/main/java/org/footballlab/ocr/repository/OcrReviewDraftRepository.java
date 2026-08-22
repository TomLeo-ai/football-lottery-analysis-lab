package org.footballlab.ocr.repository;

public interface OcrReviewDraftRepository {

    void saveInitialDraft(
            String ocrTaskId,
            String workflowId,
            String matchesJson,
            String marketsJson,
            String updatedAt);

    boolean existsActiveDraft(String workflowId);
}
