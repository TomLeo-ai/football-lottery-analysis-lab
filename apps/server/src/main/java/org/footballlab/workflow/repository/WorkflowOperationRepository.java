package org.footballlab.workflow.repository;

import java.util.List;
import java.util.Optional;

import org.footballlab.workflow.domain.WorkflowOperationRecord;
import org.footballlab.workflow.domain.WorkflowOperationType;

public interface WorkflowOperationRepository {

    Optional<WorkflowOperationRecord> findByKey(String idempotencyKey);

    void createInProgress(WorkflowOperationRecord operation);

    boolean attachWorkflow(String idempotencyKey, String workflowId, String updatedAt);

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

    boolean interruptInProgress(
            String idempotencyKey,
            WorkflowOperationType operationType,
            int httpStatus,
            String updatedAt);

    List<WorkflowOperationRecord> findStaleInProgress(
            WorkflowOperationType operationType,
            String cutoff);

    boolean interruptStale(
            String idempotencyKey,
            WorkflowOperationType operationType,
            String cutoff,
            int httpStatus,
            String updatedAt);
}
