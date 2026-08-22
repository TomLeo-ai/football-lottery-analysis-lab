package org.footballlab.workflow.domain;

public record WorkflowRecord(
        String workflowId,
        WorkflowStage currentStage,
        long version,
        String currentOcrTaskId,
        String confirmedSnapshotId,
        String currentReportId,
        String currentPlanId,
        WorkflowOperationType activeOperationType,
        String activeOperationKey,
        String createdAt,
        String updatedAt
) {
}
