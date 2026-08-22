package org.footballlab.workflow.domain;

public record WorkflowOperationRecord(
        String idempotencyKey,
        String workflowId,
        WorkflowOperationType operationType,
        String requestSha256,
        WorkflowOperationStatus operationStatus,
        String resultType,
        String resultId,
        String errorCode,
        Integer httpStatus,
        String createdAt,
        String updatedAt
) {
}
