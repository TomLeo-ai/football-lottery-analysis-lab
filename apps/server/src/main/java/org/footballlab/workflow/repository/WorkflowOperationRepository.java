package org.footballlab.workflow.repository;

import java.util.Optional;

import org.footballlab.workflow.domain.WorkflowOperationRecord;

public interface WorkflowOperationRepository {

    Optional<WorkflowOperationRecord> findByKey(String idempotencyKey);

    void createInProgress(WorkflowOperationRecord operation);

    boolean completeSuccess(
            String idempotencyKey,
            String resultType,
            String resultId,
            int httpStatus,
            String updatedAt);

    boolean completeFailure(
            String idempotencyKey,
            String errorCode,
            int httpStatus,
            String updatedAt);
}
