package org.footballlab.workflow.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

import org.footballlab.workflow.domain.WorkflowOperationRecord;
import org.footballlab.workflow.domain.WorkflowOperationStatus;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcWorkflowOperationRepository implements WorkflowOperationRepository {

    private final JdbcTemplate jdbcTemplate;

    public JdbcWorkflowOperationRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public Optional<WorkflowOperationRecord> findByKey(String idempotencyKey) {
        try {
            return Optional.ofNullable(jdbcTemplate.queryForObject(
                    "select * from workflow_operation where idempotency_key = ?",
                    this::mapOperation,
                    idempotencyKey));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    @Override
    public void createInProgress(WorkflowOperationRecord operation) {
        jdbcTemplate.update("""
                        insert into workflow_operation (
                            idempotency_key,
                            workflow_id,
                            operation_type,
                            request_sha256,
                            operation_status,
                            result_type,
                            result_id,
                            error_code,
                            http_status,
                            created_at,
                            updated_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                operation.idempotencyKey(),
                operation.workflowId(),
                operation.operationType().name(),
                operation.requestSha256(),
                WorkflowOperationStatus.IN_PROGRESS.name(),
                operation.resultType(),
                operation.resultId(),
                operation.errorCode(),
                operation.httpStatus(),
                operation.createdAt(),
                operation.updatedAt());
    }

    @Override
    public boolean attachWorkflow(String idempotencyKey, String workflowId, String updatedAt) {
        int updatedRows = jdbcTemplate.update("""
                        update workflow_operation
                        set workflow_id = ?,
                            updated_at = ?
                        where idempotency_key = ?
                          and operation_status = ?
                        """,
                workflowId,
                updatedAt,
                idempotencyKey,
                WorkflowOperationStatus.IN_PROGRESS.name());
        return updatedRows == 1;
    }

    @Override
    public boolean completeSuccess(
            String idempotencyKey,
            String resultType,
            String resultId,
            int httpStatus,
            String updatedAt
    ) {
        int updatedRows = jdbcTemplate.update("""
                        update workflow_operation
                        set operation_status = ?,
                            result_type = ?,
                            result_id = ?,
                            error_code = null,
                            http_status = ?,
                            updated_at = ?
                        where idempotency_key = ?
                          and operation_status = ?
                        """,
                WorkflowOperationStatus.SUCCEEDED.name(),
                resultType,
                resultId,
                httpStatus,
                updatedAt,
                idempotencyKey,
                WorkflowOperationStatus.IN_PROGRESS.name());
        return updatedRows == 1;
    }

    @Override
    public boolean completeFailure(String idempotencyKey, String errorCode, int httpStatus, String updatedAt) {
        int updatedRows = jdbcTemplate.update("""
                        update workflow_operation
                        set operation_status = ?,
                            result_type = null,
                            result_id = null,
                            error_code = ?,
                            http_status = ?,
                            updated_at = ?
                        where idempotency_key = ?
                          and operation_status = ?
                        """,
                WorkflowOperationStatus.FAILED.name(),
                errorCode,
                httpStatus,
                updatedAt,
                idempotencyKey,
                WorkflowOperationStatus.IN_PROGRESS.name());
        return updatedRows == 1;
    }

    private WorkflowOperationRecord mapOperation(ResultSet resultSet, int rowNumber) throws SQLException {
        return new WorkflowOperationRecord(
                resultSet.getString("idempotency_key"),
                resultSet.getString("workflow_id"),
                WorkflowOperationType.valueOf(resultSet.getString("operation_type")),
                resultSet.getString("request_sha256"),
                WorkflowOperationStatus.valueOf(resultSet.getString("operation_status")),
                resultSet.getString("result_type"),
                resultSet.getString("result_id"),
                resultSet.getString("error_code"),
                resultSet.getObject("http_status", Integer.class),
                resultSet.getString("created_at"),
                resultSet.getString("updated_at"));
    }
}
