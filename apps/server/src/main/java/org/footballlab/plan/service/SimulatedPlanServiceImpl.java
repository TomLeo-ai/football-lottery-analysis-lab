package org.footballlab.plan.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.footballlab.common.error.ApiException;
import org.footballlab.common.error.ApiFieldError;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSaveRequest;
import org.footballlab.plan.domain.StrategySimulationRequest;
import org.footballlab.plan.persistence.SimulatedPlanV2Record;
import org.footballlab.plan.repository.SimulatedPlanRepository;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.domain.WorkflowRecord;
import org.footballlab.workflow.domain.WorkflowStage;
import org.footballlab.workflow.repository.WorkflowRepository;
import org.footballlab.workflow.service.RequestHashService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class SimulatedPlanServiceImpl implements SimulatedPlanService {

    private static final String GENERATED = "GENERATED";
    private static final String PENDING_RESULT = "PENDING_RESULT";

    private final SimulatedPlanRepository simulatedPlanRepository;
    private final WorkflowRepository workflowRepository;
    private final RequestHashService requestHashService;
    private final SimulatedPlanTransactionCoordinator transactionCoordinator;

    public SimulatedPlanServiceImpl(
            SimulatedPlanRepository simulatedPlanRepository,
            WorkflowRepository workflowRepository,
            RequestHashService requestHashService,
            SimulatedPlanTransactionCoordinator transactionCoordinator) {
        this.simulatedPlanRepository = simulatedPlanRepository;
        this.workflowRepository = workflowRepository;
        this.requestHashService = requestHashService;
        this.transactionCoordinator = transactionCoordinator;
    }

    @Override
    public PlanMutationResult simulate(StrategySimulationRequest request, String idempotencyKey) {
        validateIdempotencyKey(idempotencyKey);
        validateSimulationRequest(request);
        String requestHash = requestHashService.hash(
                WorkflowOperationType.CREATE_PLAN,
                "POST",
                "/api/strategies/simulate",
                Map.of("reportId", request.reportId()));
        SimulatedPlanTransactionCoordinator.PlanMutationOutcome outcome;
        try {
            outcome = transactionCoordinator.generate(idempotencyKey, request.reportId(), requestHash);
        } catch (ApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            transactionCoordinator.recordPersistenceFailureRequiresNew(
                    idempotencyKey, null, WorkflowOperationType.CREATE_PLAN, requestHash);
            throw persistenceFailure();
        }
        if (outcome.failure() != null) {
            throw outcome.failure();
        }
        return new PlanMutationResult(outcome.httpStatus(), outcome.plan());
    }

    @Override
    public PlanMutationResult save(SimulatedPlanSaveRequest request, String idempotencyKey) {
        validateIdempotencyKey(idempotencyKey);
        NormalizedSave normalized = normalizeSaveRequest(request);
        Map<String, Object> hashFields = new LinkedHashMap<>();
        hashFields.put("generatedPlanId", normalized.planId());
        hashFields.put("operatorNote", normalized.operatorNote());
        String requestHash = requestHashService.hash(
                WorkflowOperationType.SAVE_PLAN,
                "POST",
                "/api/simulated-plans",
                hashFields);
        SimulatedPlanTransactionCoordinator.PlanMutationOutcome outcome;
        try {
            outcome = transactionCoordinator.save(
                    idempotencyKey, normalized.planId(), normalized.operatorNote(), requestHash);
        } catch (ApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            transactionCoordinator.recordPersistenceFailureRequiresNew(
                    idempotencyKey, null, WorkflowOperationType.SAVE_PLAN, requestHash);
            throw persistenceFailure();
        }
        if (outcome.failure() != null) {
            throw outcome.failure();
        }
        return new PlanMutationResult(outcome.httpStatus(), outcome.plan());
    }

    @Override
    public List<SimulatedPlanResponse> listSavedPlans() {
        try {
            return simulatedPlanRepository.listSavedPlans().stream()
                    .map(plan -> getSavedPlan(plan.planId()))
                    .toList();
        } catch (ApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw lineageFailure();
        }
    }

    @Override
    public SimulatedPlanResponse getPlanDetail(String planId) {
        validatePlanId(planId);
        try {
            var v2 = simulatedPlanRepository.findV2ById(planId);
            if (v2.isPresent()) {
                SimulatedPlanV2Record plan = v2.orElseThrow();
                WorkflowStage expectedStage = switch (plan.planStatus()) {
                    case GENERATED -> WorkflowStage.PLAN_GENERATED;
                    case PENDING_RESULT -> WorkflowStage.PENDING_RESULT;
                    default -> throw lineageFailure();
                };
                validateReadableV2(plan, expectedStage);
                return plan.toResponse();
            }
            return simulatedPlanRepository.findAnyById(planId)
                    .filter(plan -> PENDING_RESULT.equals(plan.planStatus()))
                    .orElseThrow(() -> planNotFound("Visible simulated plan was not found."));
        } catch (ApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw lineageFailure();
        }
    }

    @Override
    public SimulatedPlanResponse getSavedPlan(String planId) {
        validatePlanId(planId);
        try {
            var v2 = simulatedPlanRepository.findV2ById(planId);
            if (v2.isPresent()) {
                SimulatedPlanV2Record plan = v2.orElseThrow();
                if (!PENDING_RESULT.equals(plan.planStatus())) {
                    throw planNotFound("Pending simulated plan was not found.");
                }
                validateReadableV2(plan, WorkflowStage.PENDING_RESULT);
                return plan.toResponse();
            }
            return simulatedPlanRepository.findAnyById(planId)
                    .filter(plan -> PENDING_RESULT.equals(plan.planStatus()))
                    .orElseThrow(() -> planNotFound("Pending simulated plan was not found."));
        } catch (ApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw lineageFailure();
        }
    }

    private void validateReadableV2(SimulatedPlanV2Record plan, WorkflowStage expectedStage) {
        WorkflowRecord workflow = workflowRepository.findById(plan.workflowId())
                .orElseThrow(this::lineageFailure);
        if (workflow.currentStage() != expectedStage
                || !Objects.equals(plan.workflowId(), workflow.workflowId())
                || !Objects.equals(plan.planId(), workflow.currentPlanId())
                || !Objects.equals(plan.reportId(), workflow.currentReportId())
                || !Objects.equals(plan.snapshotId(), workflow.confirmedSnapshotId())) {
            throw lineageFailure();
        }
    }

    private void validateSimulationRequest(StrategySimulationRequest request) {
        if (request == null || request.reportId() == null || request.reportId().isBlank()) {
            throw validationFailure("reportId", "reportId is required.");
        }
    }

    private NormalizedSave normalizeSaveRequest(SimulatedPlanSaveRequest request) {
        if (request == null || request.generatedPlanId() == null || request.generatedPlanId().isBlank()) {
            throw validationFailure("generatedPlanId", "generatedPlanId is required.");
        }
        String note = request.operatorNote();
        if (note != null) {
            note = note.trim();
            if (note.isEmpty()) {
                note = null;
            } else if (note.length() > 512) {
                throw validationFailure("operatorNote", "operatorNote must not exceed 512 characters.");
            }
        }
        return new NormalizedSave(request.generatedPlanId().trim(), note);
    }

    private void validateIdempotencyKey(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw invalidIdempotencyKey();
        }
        try {
            UUID.fromString(idempotencyKey);
        } catch (IllegalArgumentException exception) {
            throw invalidIdempotencyKey();
        }
    }

    private void validatePlanId(String planId) {
        if (planId == null || planId.isBlank()) {
            throw planNotFound("Simulated plan was not found.");
        }
    }

    private ApiException invalidIdempotencyKey() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_IDEMPOTENCY_KEY",
                "A UUID Idempotency-Key header is required.");
    }

    private ApiException validationFailure(String field, String message) {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                "Request validation failed.",
                List.of(new ApiFieldError(field, message)),
                Map.of());
    }

    private ApiException persistenceFailure() {
        return new ApiException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "PLAN_PERSISTENCE_FAILED",
                "The plan could not be persisted safely.");
    }

    private ApiException lineageFailure() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "PLAN_LINEAGE_INTEGRITY_FAILED",
                "Simulated plan v2 lineage integrity validation failed.");
    }

    private ApiException planNotFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, "PLAN_NOT_FOUND", message);
    }

    private record NormalizedSave(String planId, String operatorNote) {
    }
}
