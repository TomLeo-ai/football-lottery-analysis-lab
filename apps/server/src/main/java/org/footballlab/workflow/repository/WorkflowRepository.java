package org.footballlab.workflow.repository;

import java.util.Optional;

import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.domain.WorkflowRecord;
import org.footballlab.workflow.domain.WorkflowStage;

public interface WorkflowRepository {

    void create(WorkflowRecord workflow);

    Optional<WorkflowRecord> findById(String workflowId);

    boolean transition(
            String workflowId,
            long expectedVersion,
            WorkflowStage expectedStage,
            WorkflowStage nextStage,
            String currentOcrTaskId,
            String confirmedSnapshotId,
            String currentReportId,
            String currentPlanId,
            String updatedAt);

    boolean claimActiveOperation(
            String workflowId,
            long expectedVersion,
            WorkflowStage expectedStage,
            WorkflowOperationType operationType,
            String operationKey,
            String updatedAt);

    boolean transitionClaimed(
            String workflowId,
            long expectedVersion,
            WorkflowStage expectedStage,
            WorkflowStage nextStage,
            WorkflowOperationType operationType,
            String operationKey,
            String currentReportId,
            String updatedAt);

    boolean clearActiveOperation(
            String workflowId,
            WorkflowOperationType operationType,
            String operationKey,
            String updatedAt);
}
