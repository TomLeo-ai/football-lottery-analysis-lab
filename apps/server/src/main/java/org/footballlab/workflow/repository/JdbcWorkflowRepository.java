package org.footballlab.workflow.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

import org.footballlab.common.error.ApiException;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.domain.WorkflowRecord;
import org.footballlab.workflow.domain.WorkflowStage;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcWorkflowRepository implements WorkflowRepository {

    private final JdbcTemplate jdbcTemplate;

    public JdbcWorkflowRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void create(WorkflowRecord workflow) {
        jdbcTemplate.update("""
                        insert into ocr_workflow (
                            workflow_id,
                            current_stage,
                            version,
                            current_ocr_task_id,
                            confirmed_snapshot_id,
                            current_report_id,
                            current_plan_id,
                            active_operation_type,
                            active_operation_key,
                            created_at,
                            updated_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                workflow.workflowId(),
                workflow.currentStage().name(),
                workflow.version(),
                workflow.currentOcrTaskId(),
                workflow.confirmedSnapshotId(),
                workflow.currentReportId(),
                workflow.currentPlanId(),
                workflow.activeOperationType() == null ? null : workflow.activeOperationType().name(),
                workflow.activeOperationKey(),
                workflow.createdAt(),
                workflow.updatedAt());
    }

    @Override
    public Optional<WorkflowRecord> findById(String workflowId) {
        try {
            return Optional.ofNullable(jdbcTemplate.queryForObject(
                    "select * from ocr_workflow where workflow_id = ?",
                    this::mapWorkflow,
                    workflowId));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    @Override
    public boolean transition(
            String workflowId,
            long expectedVersion,
            WorkflowStage expectedStage,
            WorkflowStage nextStage,
            String currentOcrTaskId,
            String confirmedSnapshotId,
            String currentReportId,
            String currentPlanId,
            String updatedAt
    ) {
        if (!expectedStage.canTransitionTo(nextStage)) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ILLEGAL_WORKFLOW_TRANSITION",
                    "Workflow stage transition is not allowed.");
        }
        int updatedRows = jdbcTemplate.update("""
                        update ocr_workflow
                        set current_stage = ?,
                            version = version + 1,
                            current_ocr_task_id = ?,
                            confirmed_snapshot_id = ?,
                            current_report_id = ?,
                            current_plan_id = ?,
                            updated_at = ?
                        where workflow_id = ?
                          and version = ?
                          and current_stage = ?
                        """,
                nextStage.name(),
                currentOcrTaskId,
                confirmedSnapshotId,
                currentReportId,
                currentPlanId,
                updatedAt,
                workflowId,
                expectedVersion,
                expectedStage.name());
        return updatedRows == 1;
    }

    @Override
    public boolean claimActiveOperation(
            String workflowId,
            long expectedVersion,
            WorkflowStage expectedStage,
            WorkflowOperationType operationType,
            String operationKey,
            String updatedAt
    ) {
        int updatedRows = jdbcTemplate.update("""
                        update ocr_workflow
                        set active_operation_type = ?,
                            active_operation_key = ?,
                            version = version + 1,
                            updated_at = ?
                        where workflow_id = ?
                          and version = ?
                          and current_stage = ?
                          and active_operation_type is null
                          and active_operation_key is null
                        """,
                operationType.name(),
                operationKey,
                updatedAt,
                workflowId,
                expectedVersion,
                expectedStage.name());
        return updatedRows == 1;
    }

    @Override
    public boolean clearActiveOperation(
            String workflowId,
            WorkflowOperationType operationType,
            String operationKey,
            String updatedAt
    ) {
        int updatedRows = jdbcTemplate.update("""
                        update ocr_workflow
                        set active_operation_type = null,
                            active_operation_key = null,
                            version = version + 1,
                            updated_at = ?
                        where workflow_id = ?
                          and active_operation_type = ?
                          and active_operation_key = ?
                        """,
                updatedAt,
                workflowId,
                operationType.name(),
                operationKey);
        return updatedRows == 1;
    }

    @Override
    public boolean transitionClaimed(
            String workflowId,
            long expectedVersion,
            WorkflowStage expectedStage,
            WorkflowStage nextStage,
            WorkflowOperationType operationType,
            String operationKey,
            String currentReportId,
            String updatedAt
    ) {
        if (!expectedStage.canTransitionTo(nextStage)) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ILLEGAL_WORKFLOW_TRANSITION",
                    "Workflow stage transition is not allowed.");
        }
        int updatedRows = jdbcTemplate.update("""
                        update ocr_workflow
                        set current_stage = ?,
                            current_report_id = ?,
                            active_operation_type = null,
                            active_operation_key = null,
                            version = version + 1,
                            updated_at = ?
                        where workflow_id = ?
                          and version = ?
                          and current_stage = ?
                          and active_operation_type = ?
                          and active_operation_key = ?
                        """,
                nextStage.name(),
                currentReportId,
                updatedAt,
                workflowId,
                expectedVersion,
                expectedStage.name(),
                operationType.name(),
                operationKey);
        return updatedRows == 1;
    }

    @Override
    public boolean transitionPlanGenerationClaimed(
            String workflowId,
            long expectedVersion,
            WorkflowStage expectedStage,
            WorkflowOperationType operationType,
            String operationKey,
            String currentReportId,
            String currentPlanId,
            String updatedAt) {
        if (!expectedStage.canTransitionTo(WorkflowStage.PLAN_GENERATED)) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ILLEGAL_WORKFLOW_TRANSITION",
                    "Workflow stage transition is not allowed.");
        }
        int updatedRows = jdbcTemplate.update("""
                        update ocr_workflow
                        set current_stage = ?,
                            current_plan_id = ?,
                            active_operation_type = null,
                            active_operation_key = null,
                            version = version + 1,
                            updated_at = ?
                        where workflow_id = ?
                          and version = ?
                          and current_stage = ?
                          and active_operation_type = ?
                          and active_operation_key = ?
                          and current_report_id = ?
                          and current_plan_id is null
                        """,
                WorkflowStage.PLAN_GENERATED.name(),
                currentPlanId,
                updatedAt,
                workflowId,
                expectedVersion,
                expectedStage.name(),
                operationType.name(),
                operationKey,
                currentReportId);
        return updatedRows == 1;
    }

    @Override
    public boolean transitionPlanSaveClaimed(
            String workflowId,
            long expectedVersion,
            WorkflowOperationType operationType,
            String operationKey,
            String currentReportId,
            String currentPlanId,
            String updatedAt) {
        int updatedRows = jdbcTemplate.update("""
                        update ocr_workflow
                        set current_stage = ?,
                            active_operation_type = null,
                            active_operation_key = null,
                            version = version + 1,
                            updated_at = ?
                        where workflow_id = ?
                          and version = ?
                          and current_stage = ?
                          and active_operation_type = ?
                          and active_operation_key = ?
                          and current_report_id = ?
                          and current_plan_id = ?
                        """,
                WorkflowStage.PENDING_RESULT.name(),
                updatedAt,
                workflowId,
                expectedVersion,
                WorkflowStage.PLAN_GENERATED.name(),
                operationType.name(),
                operationKey,
                currentReportId,
                currentPlanId);
        return updatedRows == 1;
    }

    private WorkflowRecord mapWorkflow(ResultSet resultSet, int rowNumber) throws SQLException {
        String activeOperationType = resultSet.getString("active_operation_type");
        return new WorkflowRecord(
                resultSet.getString("workflow_id"),
                WorkflowStage.valueOf(resultSet.getString("current_stage")),
                resultSet.getLong("version"),
                resultSet.getString("current_ocr_task_id"),
                resultSet.getString("confirmed_snapshot_id"),
                resultSet.getString("current_report_id"),
                resultSet.getString("current_plan_id"),
                activeOperationType == null ? null : WorkflowOperationType.valueOf(activeOperationType),
                resultSet.getString("active_operation_key"),
                resultSet.getString("created_at"),
                resultSet.getString("updated_at"));
    }
}
