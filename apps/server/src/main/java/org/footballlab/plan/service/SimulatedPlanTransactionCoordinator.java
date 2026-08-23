package org.footballlab.plan.service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.analysis.persistence.AnalysisReportV2Record;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.common.error.ApiException;
import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.footballlab.ocr.repository.OcrWorkflowRepository;
import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSnapshotResponse;
import org.footballlab.plan.persistence.SimulatedPlanV2Record;
import org.footballlab.plan.repository.SimulatedPlanRepository;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.footballlab.workflow.domain.WorkflowOperationRecord;
import org.footballlab.workflow.domain.WorkflowOperationStatus;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.domain.WorkflowRecord;
import org.footballlab.workflow.domain.WorkflowStage;
import org.footballlab.workflow.repository.WorkflowRepository;
import org.footballlab.workflow.service.WorkflowOperationService;
import org.footballlab.workflow.service.WorkflowOperationService.Reservation;
import org.footballlab.workflow.service.WorkflowOperationService.ReservationStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SimulatedPlanTransactionCoordinator {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter STABLE_OFFSET_FORMAT =
            DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSSSSSSSSXXX");
    private static final String GENERATED = "GENERATED";
    private static final String PENDING_RESULT = "PENDING_RESULT";
    private static final String WIN_DRAW_LOSS = "WIN_DRAW_LOSS";
    private static final Set<String> WDL_SELECTIONS = Set.of("HOME_WIN", "DRAW", "AWAY_WIN");
    private static final String PLAN_TYPE = "SIMULATED_ONLY";

    private final AnalysisReportRepository analysisReportRepository;
    private final OcrWorkflowRepository ocrWorkflowRepository;
    private final WorkflowRepository workflowRepository;
    private final WorkflowOperationService operationService;
    private final SimulatedPlanRepository simulatedPlanRepository;

    public SimulatedPlanTransactionCoordinator(
            AnalysisReportRepository analysisReportRepository,
            OcrWorkflowRepository ocrWorkflowRepository,
            WorkflowRepository workflowRepository,
            WorkflowOperationService operationService,
            SimulatedPlanRepository simulatedPlanRepository) {
        this.analysisReportRepository = analysisReportRepository;
        this.ocrWorkflowRepository = ocrWorkflowRepository;
        this.workflowRepository = workflowRepository;
        this.operationService = operationService;
        this.simulatedPlanRepository = simulatedPlanRepository;
    }

    @Transactional
    public PlanMutationOutcome generate(String idempotencyKey, String reportId, String requestHash) {
        String now = now();
        Reservation reservation = operationService.reserve(
                idempotencyKey, null, WorkflowOperationType.CREATE_PLAN, requestHash, now);
        if (reservation.status() == ReservationStatus.REPLAY) {
            return replay(reservation.operation(), HttpStatus.CREATED);
        }
        if (reservation.status() == ReservationStatus.IN_PROGRESS) {
            return PlanMutationOutcome.failure(operationInProgress());
        }

        try {
            AnalysisReportV2Record report = loadAuthoritativeReport(reportId);
            attachWorkflow(idempotencyKey, report.workflowId(), now);
            UserConfirmedSnapshotResponse snapshot = ocrWorkflowRepository.findConfirmedSnapshot(report.snapshotId())
                    .orElseThrow(() -> reportConflict("The analysis report snapshot is unavailable."));
            WorkflowRecord workflow = workflowRepository.findById(report.workflowId())
                    .orElseThrow(() -> new ApiException(
                            HttpStatus.NOT_FOUND,
                            "WORKFLOW_NOT_FOUND",
                            "The report workflow was not found."));
            validateAuthority(report, snapshot, workflow);
            if (hasText(workflow.currentPlanId())) {
                throw alreadyGenerated(workflow.currentPlanId());
            }

            boolean claimed = workflowRepository.claimActiveOperation(
                    workflow.workflowId(),
                    workflow.version(),
                    WorkflowStage.ANALYSIS_GENERATED,
                    WorkflowOperationType.CREATE_PLAN,
                    idempotencyKey,
                    now);
            if (!claimed) {
                throw operationInProgress();
            }

            SimulatedPlanV2Record plan = buildPlan(report, now);
            simulatedPlanRepository.insertGeneratedPlan(plan);
            boolean transitioned = workflowRepository.transitionPlanGenerationClaimed(
                    workflow.workflowId(),
                    workflow.version() + 1,
                    WorkflowStage.ANALYSIS_GENERATED,
                    WorkflowOperationType.CREATE_PLAN,
                    idempotencyKey,
                    report.reportId(),
                    plan.planId(),
                    now);
            if (!transitioned) {
                throw new IllegalStateException("Generated plan workflow compare-and-set failed.");
            }
            boolean completed = operationService.completeSuccess(
                    idempotencyKey,
                    "SIMULATED_PLAN",
                    plan.planId(),
                    HttpStatus.CREATED.value(),
                    now);
            if (!completed) {
                throw new IllegalStateException("Generated plan operation success update failed.");
            }
            return PlanMutationOutcome.success(HttpStatus.CREATED, plan.toResponse());
        } catch (ApiException exception) {
            completeDeterministicFailure(idempotencyKey, exception, now);
            return PlanMutationOutcome.failure(exception);
        }
    }

    @Transactional
    public PlanMutationOutcome save(
            String idempotencyKey,
            String planId,
            String normalizedNote,
            String requestHash) {
        String now = now();
        Reservation reservation = operationService.reserve(
                idempotencyKey, null, WorkflowOperationType.SAVE_PLAN, requestHash, now);
        if (reservation.status() == ReservationStatus.REPLAY) {
            return replay(reservation.operation(), HttpStatus.OK);
        }
        if (reservation.status() == ReservationStatus.IN_PROGRESS) {
            return PlanMutationOutcome.failure(operationInProgress());
        }

        try {
            SimulatedPlanV2Record plan = loadV2PlanForMutation(planId);
            attachWorkflow(idempotencyKey, plan.workflowId(), now);
            WorkflowRecord workflow = workflowRepository.findById(plan.workflowId())
                    .orElseThrow(() -> planIntegrity("The plan workflow was not found."));
            validatePlanLineage(plan, workflow);
            if (PENDING_RESULT.equals(plan.planStatus())
                    || workflow.currentStage() == WorkflowStage.PENDING_RESULT) {
                throw alreadySaved(plan.planId());
            }
            if (!GENERATED.equals(plan.planStatus())
                    || workflow.currentStage() != WorkflowStage.PLAN_GENERATED) {
                throw planIntegrity("Only the current generated plan can be saved.");
            }

            boolean claimed = workflowRepository.claimActiveOperation(
                    workflow.workflowId(),
                    workflow.version(),
                    WorkflowStage.PLAN_GENERATED,
                    WorkflowOperationType.SAVE_PLAN,
                    idempotencyKey,
                    now);
            if (!claimed) {
                throw operationInProgress();
            }
            if (!simulatedPlanRepository.transitionToPendingResult(plan.planId(), normalizedNote, now)) {
                throw new IllegalStateException("Generated plan header transition failed.");
            }
            boolean transitioned = workflowRepository.transitionPlanSaveClaimed(
                    workflow.workflowId(),
                    workflow.version() + 1,
                    WorkflowOperationType.SAVE_PLAN,
                    idempotencyKey,
                    workflow.currentReportId(),
                    plan.planId(),
                    now);
            if (!transitioned) {
                throw new IllegalStateException("Saved plan workflow compare-and-set failed.");
            }
            boolean completed = operationService.completeSuccess(
                    idempotencyKey,
                    "SIMULATED_PLAN",
                    plan.planId(),
                    HttpStatus.OK.value(),
                    now);
            if (!completed) {
                throw new IllegalStateException("Saved plan operation success update failed.");
            }
            SimulatedPlanResponse pending = simulatedPlanRepository.findV2ById(plan.planId())
                    .map(SimulatedPlanV2Record::toResponse)
                    .orElseThrow(() -> new IllegalStateException("Saved v2 plan could not be reloaded."));
            return PlanMutationOutcome.success(HttpStatus.OK, pending);
        } catch (ApiException exception) {
            completeDeterministicFailure(idempotencyKey, exception, now);
            return PlanMutationOutcome.failure(exception);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordPersistenceFailureRequiresNew(
            String idempotencyKey,
            String workflowId,
            WorkflowOperationType operationType,
            String requestHash) {
        String now = now();
        Reservation reservation = operationService.reserve(
                idempotencyKey, workflowId, operationType, requestHash, now);
        if (reservation.status() != ReservationStatus.RESERVED) {
            return;
        }
        boolean completed = operationService.completeFailure(
                idempotencyKey,
                "PLAN_PERSISTENCE_FAILED",
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                now);
        if (!completed) {
            throw new IllegalStateException("Plan persistence failure operation update failed.");
        }
    }

    private AnalysisReportV2Record loadAuthoritativeReport(String reportId) {
        try {
            var v2 = analysisReportRepository.findV2ById(reportId);
            if (v2.isPresent()) {
                return v2.orElseThrow();
            }
            if (analysisReportRepository.findAnyById(reportId).isPresent()) {
                throw reportConflict("Legacy analysis reports cannot generate authoritative plans.");
            }
            throw new ApiException(HttpStatus.NOT_FOUND, "REPORT_NOT_FOUND", "Analysis report was not found.");
        } catch (ApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw reportConflict("Analysis report integrity validation failed.");
        }
    }

    private SimulatedPlanV2Record loadV2PlanForMutation(String planId) {
        try {
            var v2 = simulatedPlanRepository.findV2ById(planId);
            if (v2.isPresent()) {
                return v2.orElseThrow();
            }
            if (simulatedPlanRepository.findAnyById(planId).isPresent()) {
                throw planIntegrity("Legacy plans cannot enter the authoritative save workflow.");
            }
            throw new ApiException(HttpStatus.NOT_FOUND, "PLAN_NOT_FOUND", "Simulated plan was not found.");
        } catch (ApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw planIntegrity("Simulated plan v2 integrity validation failed.");
        }
    }

    private void validateAuthority(
            AnalysisReportV2Record report,
            UserConfirmedSnapshotResponse snapshot,
            WorkflowRecord workflow) {
        if (!AnalysisReportV2Record.AUTHORITY_TYPE.equals(report.authorityType())
                || !GENERATED.equals(report.reportStatus())
                || !"PASSED".equals(report.safetyStatus())
                || !"USER_SCREENSHOT_CONFIRMED".equals(report.inputSourceType())
                || report.authorityRevision() < 1
                || report.strategyParameters() == null
                || report.probabilityAnalysis() == null
                || report.probabilityAnalysis().isEmpty()
                || report.simulatedSelections() == null
                || report.simulatedSelections().isEmpty()) {
            throw reportConflict("Analysis report is not a safe generated v2 authority.");
        }
        if (!"CONFIRMED_SNAPSHOT_V2".equals(snapshot.schemaVersion())
                || !"SERVER_CONFIRMED_V2".equals(snapshot.authorityType())
                || !"USER_SCREENSHOT_CONFIRMED".equals(snapshot.sourceType())
                || !"CONFIRMED".equals(snapshot.snapshotStatus())
                || !snapshot.analysisAllowed()
                || snapshot.confirmedRevision() == null
                || snapshot.matches() == null
                || snapshot.matches().isEmpty()
                || snapshot.markets() == null
                || snapshot.markets().isEmpty()) {
            throw reportConflict("Analysis report snapshot is not an allowed confirmed v2 authority.");
        }
        if (!Objects.equals(report.workflowId(), snapshot.workflowId())
                || !Objects.equals(report.workflowId(), workflow.workflowId())
                || !Objects.equals(report.snapshotId(), snapshot.snapshotId())
                || !Objects.equals(report.snapshotId(), workflow.confirmedSnapshotId())
                || report.authorityRevision() != snapshot.confirmedRevision()
                || !Objects.equals(snapshot.ocrTaskId(), workflow.currentOcrTaskId())
                || !Objects.equals(report.reportId(), workflow.currentReportId())
                || !isPlanGenerationVisibleStage(workflow)) {
            throw reportConflict("Analysis report, snapshot, and workflow lineage do not match.");
        }
        validateStrategy(report.strategyParameters(), snapshot);
        validateProbabilities(report.probabilityAnalysis(), snapshot.matches());
        validateSelections(report.simulatedSelections(), snapshot);
    }

    private boolean isPlanGenerationVisibleStage(WorkflowRecord workflow) {
        if (workflow.currentStage() == WorkflowStage.ANALYSIS_GENERATED) {
            return true;
        }
        return hasText(workflow.currentPlanId())
                && (workflow.currentStage() == WorkflowStage.PLAN_GENERATED
                        || workflow.currentStage() == WorkflowStage.PENDING_RESULT);
    }

    private void validateStrategy(StrategyParameterRequest strategy, UserConfirmedSnapshotResponse snapshot) {
        if (!decimalEquals(strategy.budgetAmount(), snapshot.budgetAmount())
                || !Objects.equals(strategy.currency(), snapshot.currency())
                || !Objects.equals(strategy.riskPreference(), snapshot.riskPreference())
                || !List.of(WIN_DRAW_LOSS).equals(strategy.preferredPlayTypes())
                || strategy.excludedPlayTypes() == null
                || !strategy.excludedPlayTypes().isEmpty()
                || !"DISABLED".equals(strategy.exactScorePolicy())) {
            throw reportConflict("Analysis strategy does not match its confirmed snapshot authority.");
        }
    }

    private void validateProbabilities(
            List<ProbabilityInsightResponse> probabilities,
            List<ConfirmedMatchResponse> matches) {
        Map<String, ConfirmedMatchResponse> matchesById = matches.stream()
                .collect(Collectors.toMap(ConfirmedMatchResponse::matchId, Function.identity(), (a, b) -> a));
        Map<String, ProbabilityInsightResponse> probabilitiesById = new HashMap<>();
        for (ProbabilityInsightResponse probability : probabilities) {
            if (probability == null
                    || !hasText(probability.matchId())
                    || probabilitiesById.put(probability.matchId(), probability) != null) {
                throw reportConflict("Analysis probability match identifiers are invalid.");
            }
            ConfirmedMatchResponse match = matchesById.get(probability.matchId());
            if (match == null
                    || !Objects.equals(probability.matchDate(), match.matchDate())
                    || !Objects.equals(probability.league(), match.league())
                    || !Objects.equals(probability.homeTeam(), match.homeTeam())
                    || !Objects.equals(probability.awayTeam(), match.awayTeam())
                    || !Objects.equals(probability.kickoffTime(), match.kickoffTime())) {
                throw reportConflict("Analysis probability metadata does not match its confirmed snapshot.");
            }
        }
        if (!probabilitiesById.keySet().equals(matchesById.keySet())) {
            throw reportConflict("Analysis probability matches are incomplete.");
        }
    }

    private void validateSelections(
            List<SimulatedSelectionResponse> selections,
            UserConfirmedSnapshotResponse snapshot) {
        Set<String> matchIds = snapshot.matches().stream()
                .map(ConfirmedMatchResponse::matchId)
                .collect(Collectors.toCollection(HashSet::new));
        for (SimulatedSelectionResponse selection : selections) {
            if (selection == null
                    || !matchIds.contains(selection.matchId())
                    || !WIN_DRAW_LOSS.equals(selection.playType())
                    || !WDL_SELECTIONS.contains(selection.selection())
                    || selection.stakeAmount() == null
                    || selection.stakeAmount().signum() < 0
                    || maximumScale(selection.stakeAmount()) > 2
                    || selection.odds() == null
                    || maximumScale(selection.odds()) > 4
                    || snapshot.markets().stream().noneMatch(market -> marketMatches(market, selection))) {
                throw reportConflict("Analysis selection is not supported by its confirmed snapshot.");
            }
        }
    }

    private boolean marketMatches(ConfirmedMarketResponse market, SimulatedSelectionResponse selection) {
        return Objects.equals(market.matchId(), selection.matchId())
                && Objects.equals(market.playType(), selection.playType())
                && Objects.equals(market.selection(), selection.selection())
                && decimalEquals(market.odds(), selection.odds());
    }

    private SimulatedPlanV2Record buildPlan(AnalysisReportV2Record report, String now) {
        Map<String, ProbabilityInsightResponse> probabilities = report.probabilityAnalysis().stream()
                .collect(Collectors.toMap(ProbabilityInsightResponse::matchId, Function.identity()));
        List<SimulatedPlanItemResponse> items = report.simulatedSelections().stream()
                .map(selection -> {
                    ProbabilityInsightResponse probability = probabilities.get(selection.matchId());
                    return new SimulatedPlanItemResponse(
                            "sim-item-" + UUID.randomUUID(),
                            selection.matchId(),
                            probability.matchDate(),
                            probability.league(),
                            probability.homeTeam(),
                            probability.awayTeam(),
                            probability.kickoffTime(),
                            selection.playType(),
                            selection.selection(),
                            selection.odds(),
                            selection.stakeAmount(),
                            GENERATED,
                            selection.note());
                })
                .toList();
        SimulatedPlanSnapshotResponse planSnapshot = new SimulatedPlanSnapshotResponse(
                "sim-snapshot-" + UUID.randomUUID(),
                report.snapshotId(),
                report.reportId(),
                report.inputSourceType(),
                report.engineType(),
                report.reportStatus(),
                report.strategyParameters(),
                items.size(),
                GENERATED,
                now);
        return new SimulatedPlanV2Record(
                report.workflowId(),
                SimulatedPlanV2Record.AUTHORITY_TYPE,
                "sim-plan-" + UUID.randomUUID(),
                PLAN_TYPE,
                GENERATED,
                report.reportId(),
                report.snapshotId(),
                report.strategyParameters().currency(),
                report.strategyParameters().budgetAmount(),
                report.strategyParameters(),
                List.of(GENERATED),
                items,
                planSnapshot,
                report.complianceNotice(),
                null,
                now,
                now);
    }

    private void validatePlanLineage(SimulatedPlanV2Record plan, WorkflowRecord workflow) {
        if (!SimulatedPlanV2Record.AUTHORITY_TYPE.equals(plan.authorityType())
                || !Objects.equals(plan.workflowId(), workflow.workflowId())
                || !Objects.equals(plan.planId(), workflow.currentPlanId())
                || !Objects.equals(plan.reportId(), workflow.currentReportId())
                || !Objects.equals(plan.snapshotId(), workflow.confirmedSnapshotId())) {
            throw planIntegrity("Plan and workflow lineage do not match.");
        }
    }

    private PlanMutationOutcome replay(WorkflowOperationRecord operation, HttpStatus fallback) {
        if (operation.operationStatus() == WorkflowOperationStatus.SUCCEEDED) {
            SimulatedPlanResponse plan = simulatedPlanRepository.findV2ById(operation.resultId())
                    .map(SimulatedPlanV2Record::toResponse)
                    .orElseThrow(() -> new IllegalStateException(
                            "Succeeded plan operation does not reference a v2 plan."));
            return PlanMutationOutcome.success(resolveStatus(operation.httpStatus(), fallback), plan);
        }
        if (operation.operationStatus() == WorkflowOperationStatus.INTERRUPTED) {
            return PlanMutationOutcome.failure(new ApiException(
                    resolveStatus(operation.httpStatus(), HttpStatus.CONFLICT),
                    "OPERATION_INTERRUPTED",
                    "The previous plan operation was interrupted and will not be retried automatically."));
        }
        if (operation.operationStatus() == WorkflowOperationStatus.FAILED) {
            String errorCode = operation.errorCode() == null ? "PLAN_OPERATION_FAILED" : operation.errorCode();
            return PlanMutationOutcome.failure(new ApiException(
                    resolveStatus(operation.httpStatus(), HttpStatus.CONFLICT),
                    errorCode,
                    replayMessage(errorCode),
                    List.of(),
                    recoveryFor(operation, errorCode)));
        }
        return PlanMutationOutcome.failure(operationInProgress());
    }

    private Map<String, Object> recoveryFor(WorkflowOperationRecord operation, String errorCode) {
        if (!("PLAN_ALREADY_GENERATED".equals(errorCode) || "PLAN_ALREADY_SAVED".equals(errorCode))
                || !hasText(operation.workflowId())) {
            return Map.of();
        }
        return workflowRepository.findById(operation.workflowId())
                .map(WorkflowRecord::currentPlanId)
                .filter(this::hasText)
                .map(planId -> Map.<String, Object>of("currentPlanId", planId))
                .orElse(Map.of());
    }

    private String replayMessage(String errorCode) {
        return switch (errorCode) {
            case "PLAN_ALREADY_GENERATED" -> "A plan was already generated for this workflow.";
            case "PLAN_ALREADY_SAVED" -> "The plan was already saved for result review.";
            case "PLAN_PERSISTENCE_FAILED" -> "The plan could not be persisted safely.";
            default -> "The previous plan operation failed and will not be retried automatically.";
        };
    }

    private void attachWorkflow(String key, String workflowId, String now) {
        if (!operationService.attachWorkflow(key, workflowId, now)) {
            throw new IllegalStateException("Plan operation workflow attachment failed.");
        }
    }

    private void completeDeterministicFailure(String key, ApiException exception, String now) {
        if (!operationService.completeFailure(key, exception.errorCode(), exception.status().value(), now)) {
            throw new IllegalStateException("Plan operation failure update failed.");
        }
    }

    private ApiException reportConflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, "REPORT_STATE_CONFLICT", message);
    }

    private ApiException planIntegrity(String message) {
        return new ApiException(HttpStatus.CONFLICT, "PLAN_LINEAGE_INTEGRITY_FAILED", message);
    }

    private ApiException alreadyGenerated(String planId) {
        return new ApiException(
                HttpStatus.CONFLICT,
                "PLAN_ALREADY_GENERATED",
                "A plan was already generated for this workflow.",
                List.of(),
                Map.of("currentPlanId", planId));
    }

    private ApiException alreadySaved(String planId) {
        return new ApiException(
                HttpStatus.CONFLICT,
                "PLAN_ALREADY_SAVED",
                "The plan was already saved for result review.",
                List.of(),
                Map.of("currentPlanId", planId));
    }

    private ApiException operationInProgress() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "OPERATION_IN_PROGRESS",
                "Another plan operation is already in progress for this workflow.");
    }

    private int maximumScale(BigDecimal value) {
        return Math.max(value.scale(), 0);
    }

    private boolean decimalEquals(BigDecimal first, BigDecimal second) {
        return first == null ? second == null : second != null && first.compareTo(second) == 0;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private HttpStatus resolveStatus(Integer value, HttpStatus fallback) {
        HttpStatus resolved = value == null ? null : HttpStatus.resolve(value);
        return resolved == null ? fallback : resolved;
    }

    private String now() {
        return STABLE_OFFSET_FORMAT.format(OffsetDateTime.now(DEFAULT_ZONE));
    }

    public record PlanMutationOutcome(
            HttpStatus httpStatus,
            SimulatedPlanResponse plan,
            ApiException failure) {

        static PlanMutationOutcome success(HttpStatus status, SimulatedPlanResponse plan) {
            return new PlanMutationOutcome(status, plan, null);
        }

        static PlanMutationOutcome failure(ApiException failure) {
            return new PlanMutationOutcome(failure.status(), null, failure);
        }
    }
}
