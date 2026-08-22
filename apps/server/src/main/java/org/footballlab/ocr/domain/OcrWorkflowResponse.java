package org.footballlab.ocr.domain;

public record OcrWorkflowResponse(
        String workflowId,
        String currentStage,
        long version,
        String screenshotTaskId,
        String currentOcrTaskId,
        String confirmedSnapshotId,
        String currentReportId,
        String currentPlanId,
        String createdAt,
        String updatedAt
) {
}
