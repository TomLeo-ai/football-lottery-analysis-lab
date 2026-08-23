package org.footballlab.workflow.service;

import java.util.Map;

import org.footballlab.common.error.ApiException;
import org.footballlab.workflow.domain.WorkflowOperationRecord;
import org.footballlab.workflow.domain.WorkflowOperationStatus;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.repository.WorkflowOperationRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkflowOperationService {

    private final WorkflowOperationRepository operationRepository;

    public WorkflowOperationService(WorkflowOperationRepository operationRepository) {
        this.operationRepository = operationRepository;
    }

    @Transactional
    public Reservation reserve(
            String idempotencyKey,
            String workflowId,
            WorkflowOperationType operationType,
            String requestSha256,
            String now
    ) {
        return operationRepository.findByKey(idempotencyKey)
                .map(existing -> classifyExisting(existing, operationType, requestSha256))
                .orElseGet(() -> createReservation(idempotencyKey, workflowId, operationType, requestSha256, now));
    }

    @Transactional
    public boolean completeSuccess(
            String idempotencyKey,
            String resultType,
            String resultId,
            int httpStatus,
            String updatedAt
    ) {
        return operationRepository.completeSuccess(idempotencyKey, resultType, resultId, httpStatus, updatedAt);
    }

    @Transactional
    public boolean attachWorkflow(String idempotencyKey, String workflowId, String updatedAt) {
        return operationRepository.attachWorkflow(idempotencyKey, workflowId, updatedAt);
    }

    @Transactional
    public boolean completeFailure(String idempotencyKey, String errorCode, int httpStatus, String updatedAt) {
        return operationRepository.completeFailure(idempotencyKey, errorCode, httpStatus, updatedAt);
    }

    @Transactional
    public boolean interruptInProgress(
            String idempotencyKey,
            WorkflowOperationType operationType,
            int httpStatus,
            String updatedAt) {
        return operationRepository.interruptInProgress(
                idempotencyKey, operationType, httpStatus, updatedAt);
    }

    private Reservation createReservation(
            String idempotencyKey,
            String workflowId,
            WorkflowOperationType operationType,
            String requestSha256,
            String now
    ) {
        WorkflowOperationRecord operation = new WorkflowOperationRecord(
                idempotencyKey,
                workflowId,
                operationType,
                requestSha256,
                WorkflowOperationStatus.IN_PROGRESS,
                null,
                null,
                null,
                null,
                now,
                now);
        operationRepository.createInProgress(operation);
        return new Reservation(ReservationStatus.RESERVED, operation);
    }

    private Reservation classifyExisting(
            WorkflowOperationRecord existing,
            WorkflowOperationType operationType,
            String requestSha256
    ) {
        if (existing.operationType() != operationType || !existing.requestSha256().equals(requestSha256)) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "IDEMPOTENCY_KEY_REUSED",
                    "Idempotency key was already used for a different workflow request.",
                    null,
                    Map.of("idempotencyKey", existing.idempotencyKey()));
        }
        if (existing.operationStatus() == WorkflowOperationStatus.IN_PROGRESS) {
            return new Reservation(ReservationStatus.IN_PROGRESS, existing);
        }
        return new Reservation(ReservationStatus.REPLAY, existing);
    }

    public enum ReservationStatus {
        RESERVED,
        IN_PROGRESS,
        REPLAY
    }

    public record Reservation(ReservationStatus status, WorkflowOperationRecord operation) {
    }
}
