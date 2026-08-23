package org.footballlab.analysis.service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ResolvedAnalysisEngineConfiguration;
import org.footballlab.analysis.persistence.AnalysisReportV2Record;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.common.error.ApiException;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.footballlab.ocr.repository.OcrWorkflowRepository;
import org.footballlab.strategy.domain.ResolvedStrategyParameters;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.footballlab.strategy.service.AnalysisOptionsResolver;
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
import org.springframework.web.server.ResponseStatusException;

@Service
public class AnalysisTransactionCoordinator {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final String CONFIRMED_SNAPSHOT_V2 = "CONFIRMED_SNAPSHOT_V2";
    private static final String SERVER_CONFIRMED_V2 = "SERVER_CONFIRMED_V2";
    private static final String USER_SCREENSHOT_CONFIRMED = "USER_SCREENSHOT_CONFIRMED";
    private static final String CONFIRMED = "CONFIRMED";
    private static final String WIN_DRAW_LOSS = "WIN_DRAW_LOSS";
    private static final Set<String> WDL_SELECTIONS = Set.of("HOME_WIN", "DRAW", "AWAY_WIN");

    private final OcrWorkflowRepository ocrWorkflowRepository;
    private final WorkflowRepository workflowRepository;
    private final WorkflowOperationService operationService;
    private final AnalysisReportRepository analysisReportRepository;
    private final AnalysisOptionsResolver analysisOptionsResolver;
    private final MockRuleAnalysisEngine ruleEngine;

    public AnalysisTransactionCoordinator(
            OcrWorkflowRepository ocrWorkflowRepository,
            WorkflowRepository workflowRepository,
            WorkflowOperationService operationService,
            AnalysisReportRepository analysisReportRepository,
            AnalysisOptionsResolver analysisOptionsResolver,
            MockRuleAnalysisEngine ruleEngine) {
        this.ocrWorkflowRepository = ocrWorkflowRepository;
        this.workflowRepository = workflowRepository;
        this.operationService = operationService;
        this.analysisReportRepository = analysisReportRepository;
        this.analysisOptionsResolver = analysisOptionsResolver;
        this.ruleEngine = ruleEngine;
    }

    @Transactional
    public RuleGenerationOutcome generateRuleInSingleTransaction(
            String idempotencyKey,
            AnalysisGenerateRequest request,
            String workflowIdHint,
            String requestHash,
            ResolvedAnalysisEngineConfiguration engineConfiguration,
            StrategyParameterRequest hashedStrategyParameters,
            String hashedDefaultsVersion) {
        String now = now();
        Reservation reservation = operationService.reserve(
                idempotencyKey,
                workflowIdHint,
                WorkflowOperationType.GENERATE_REPORT,
                requestHash,
                now);
        if (reservation.status() == ReservationStatus.REPLAY) {
            return replay(reservation.operation());
        }
        if (reservation.status() == ReservationStatus.IN_PROGRESS) {
            return RuleGenerationOutcome.failure(new ApiException(
                    HttpStatus.CONFLICT,
                    "OPERATION_IN_PROGRESS",
                    "A workflow operation with the same idempotency key is still in progress."));
        }

        PreparedRuleAnalysis prepared;
        try {
            prepared = prepareAuthoritativeAnalysis(
                    request,
                    workflowIdHint,
                    engineConfiguration,
                    hashedStrategyParameters,
                    hashedDefaultsVersion);
        } catch (ApiException exception) {
            completeDeterministicFailure(idempotencyKey, exception, now);
            return RuleGenerationOutcome.failure(exception);
        }

        AnalysisEngineResult engineResult;
        try {
            engineResult = ruleEngine.generate(new AnalysisEngineContext(
                    "analysis-" + UUID.randomUUID(),
                    now,
                    prepared.input(),
                    engineConfiguration,
                    prepared.strategyParameters()));
        } catch (ApiException exception) {
            completeDeterministicFailure(idempotencyKey, exception, now);
            return RuleGenerationOutcome.failure(exception);
        }

        AnalysisReportV2Record report = AnalysisReportV2Record.fromResponse(
                engineResult.report(),
                prepared.workflow().workflowId(),
                prepared.snapshot().confirmedRevision(),
                AnalysisReportV2Record.AUTHORITY_TYPE,
                prepared.defaultsVersion());
        analysisReportRepository.insertV2(report);
        boolean transitioned = workflowRepository.transition(
                prepared.workflow().workflowId(),
                prepared.workflow().version(),
                WorkflowStage.CONFIRMED,
                WorkflowStage.ANALYSIS_GENERATED,
                prepared.workflow().currentOcrTaskId(),
                prepared.snapshot().snapshotId(),
                report.reportId(),
                prepared.workflow().currentPlanId(),
                now);
        if (!transitioned) {
            throw new IllegalStateException("Analysis workflow compare-and-set update failed.");
        }
        boolean completed = operationService.completeSuccess(
                idempotencyKey,
                "ANALYSIS_REPORT",
                report.reportId(),
                HttpStatus.CREATED.value(),
                now);
        if (!completed) {
            throw new IllegalStateException("Analysis operation success update failed.");
        }
        return RuleGenerationOutcome.success(HttpStatus.CREATED, report.toResponse());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordPersistenceFailureRequiresNew(
            String idempotencyKey,
            String workflowId,
            String requestHash) {
        String now = now();
        Reservation reservation = operationService.reserve(
                idempotencyKey,
                workflowId,
                WorkflowOperationType.GENERATE_REPORT,
                requestHash,
                now);
        if (reservation.status() == ReservationStatus.REPLAY) {
            return;
        }
        boolean completed = operationService.completeFailure(
                idempotencyKey,
                "ANALYSIS_PERSISTENCE_FAILED",
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                now);
        if (!completed) {
            throw new IllegalStateException("Analysis persistence failure operation update failed.");
        }
    }

    static StrategyParameterRequest toStrategyParameters(ResolvedStrategyParameters resolved) {
        return new StrategyParameterRequest(
                resolved.budgetAmount(),
                resolved.currency(),
                resolved.targetTicketCount(),
                resolved.minTicketCount(),
                resolved.maxTicketCount(),
                resolved.riskPreference(),
                resolved.mainTicketRatio(),
                resolved.defensiveTicketRatio(),
                resolved.entertainmentTicketRatio(),
                resolved.enableEntertainmentTicket(),
                resolved.entertainmentTicketMaxCost(),
                resolved.maxParlayLegs(),
                resolved.preferredPlayTypes(),
                resolved.excludedPlayTypes(),
                resolved.exactScorePolicy(),
                resolved.minPayoutRequirement(),
                resolved.allowLowReturnTicket(),
                resolved.upsetCoverageLevel());
    }

    private PreparedRuleAnalysis prepareAuthoritativeAnalysis(
            AnalysisGenerateRequest request,
            String workflowIdHint,
            ResolvedAnalysisEngineConfiguration engineConfiguration,
            StrategyParameterRequest hashedStrategyParameters,
            String hashedDefaultsVersion) {
        if (!MockRuleAnalysisEngine.ENGINE_MODE.equals(engineConfiguration.engineMode())) {
            throw badRequest("UNSUPPORTED_ANALYSIS_ENGINE", "Only MOCK_RULE_ENGINE is available in this transaction.");
        }
        UserConfirmedSnapshotResponse snapshot = ocrWorkflowRepository.findConfirmedSnapshot(request.snapshotId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "SNAPSHOT_NOT_FOUND",
                        "Confirmed snapshot was not found."));
        validateSnapshot(snapshot, request.snapshotId(), workflowIdHint);
        WorkflowRecord workflow = workflowRepository.findById(snapshot.workflowId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "WORKFLOW_NOT_FOUND",
                        "OCR workflow was not found."));
        validateWorkflow(workflow, snapshot);
        validateMarkets(snapshot);

        ResolvedStrategyParameters resolved;
        try {
            resolved = analysisOptionsResolver.resolve(
                    request.analysisOptions(),
                    snapshot.budgetAmount(),
                    snapshot.currency(),
                    snapshot.riskPreference(),
                    snapshot.matches().size());
        } catch (ResponseStatusException exception) {
            throw badRequest(
                    "INVALID_ANALYSIS_OPTIONS",
                    exception.getReason() == null ? "Analysis options are invalid." : exception.getReason());
        }
        StrategyParameterRequest strategyParameters = toStrategyParameters(resolved);
        if (!Objects.equals(strategyParameters, hashedStrategyParameters)
                || !Objects.equals(resolved.defaultsVersion(), hashedDefaultsVersion)) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "SNAPSHOT_AUTHORITY_CHANGED",
                    "Confirmed snapshot authority changed before analysis generation.");
        }
        return new PreparedRuleAnalysis(
                workflow,
                snapshot,
                AuthoritativeAnalysisInput.fromConfirmedSnapshot(snapshot),
                strategyParameters,
                resolved.defaultsVersion());
    }

    private void validateSnapshot(
            UserConfirmedSnapshotResponse snapshot,
            String requestedSnapshotId,
            String workflowIdHint) {
        if (!Objects.equals(requestedSnapshotId, snapshot.snapshotId())
                || !CONFIRMED_SNAPSHOT_V2.equals(snapshot.schemaVersion())
                || !SERVER_CONFIRMED_V2.equals(snapshot.authorityType())
                || !USER_SCREENSHOT_CONFIRMED.equals(snapshot.sourceType())
                || !CONFIRMED.equals(snapshot.snapshotStatus())
                || !snapshot.analysisAllowed()
                || snapshot.confirmedRevision() == null
                || snapshot.confirmedRevision() <= 0
                || snapshot.workflowId() == null
                || snapshot.workflowId().isBlank()
                || !Objects.equals(workflowIdHint, snapshot.workflowId())) {
            throw badRequest(
                    "SNAPSHOT_NOT_AUTHORITATIVE",
                    "Snapshot is not a server-confirmed v2 analysis authority.");
        }
        if (snapshot.matches() == null || snapshot.matches().isEmpty()
                || snapshot.markets() == null || snapshot.markets().isEmpty()) {
            throw badRequest(
                    "SNAPSHOT_NOT_ANALYZABLE",
                    "Confirmed snapshot must contain matches and markets.");
        }
    }

    private void validateWorkflow(WorkflowRecord workflow, UserConfirmedSnapshotResponse snapshot) {
        if (workflow.currentReportId() != null && !workflow.currentReportId().isBlank()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ANALYSIS_ALREADY_GENERATED",
                    "Analysis was already generated for this workflow.",
                    List.of(),
                    Map.of("currentReportId", workflow.currentReportId()));
        }
        if (workflow.currentStage() != WorkflowStage.CONFIRMED) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "WORKFLOW_STAGE_CONFLICT",
                    "Workflow is not ready for analysis generation.");
        }
        if (!Objects.equals(workflow.confirmedSnapshotId(), snapshot.snapshotId())
                || !Objects.equals(workflow.currentOcrTaskId(), snapshot.ocrTaskId())) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "SNAPSHOT_WORKFLOW_MISMATCH",
                    "Snapshot is not the workflow's current confirmed authority.");
        }
    }

    private void validateMarkets(UserConfirmedSnapshotResponse snapshot) {
        Set<String> matchIds = new HashSet<>();
        snapshot.matches().forEach(match -> matchIds.add(match.matchId()));
        for (var market : snapshot.markets()) {
            if (!matchIds.contains(market.matchId())
                    || !WIN_DRAW_LOSS.equals(market.playType())
                    || !WDL_SELECTIONS.contains(market.selection())) {
                throw badRequest(
                        "UNSUPPORTED_ANALYSIS_MARKET",
                        "Confirmed snapshot contains an unsupported market or selection.");
            }
        }
    }

    private RuleGenerationOutcome replay(WorkflowOperationRecord operation) {
        if (operation.operationStatus() == WorkflowOperationStatus.SUCCEEDED) {
            AnalysisReportResponse report = analysisReportRepository.findV2ById(operation.resultId())
                    .map(AnalysisReportV2Record::toResponse)
                    .orElseThrow(() -> new IllegalStateException(
                            "Succeeded analysis operation does not reference a v2 report."));
            HttpStatus status = resolveStatus(operation.httpStatus(), HttpStatus.CREATED);
            return RuleGenerationOutcome.success(status, report);
        }
        if (operation.operationStatus() == WorkflowOperationStatus.INTERRUPTED) {
            return RuleGenerationOutcome.failure(new ApiException(
                    resolveStatus(operation.httpStatus(), HttpStatus.CONFLICT),
                    "OPERATION_INTERRUPTED",
                    "The previous analysis operation was interrupted and will not be retried automatically."));
        }
        if (operation.operationStatus() == WorkflowOperationStatus.FAILED) {
            String errorCode = operation.errorCode() == null
                    ? "ANALYSIS_OPERATION_FAILED"
                    : operation.errorCode();
            Map<String, Object> recovery = recoveryForFailedReplay(operation, errorCode);
            return RuleGenerationOutcome.failure(new ApiException(
                    resolveStatus(operation.httpStatus(), HttpStatus.CONFLICT),
                    errorCode,
                    safeReplayMessage(errorCode),
                    List.of(),
                    recovery));
        }
        return RuleGenerationOutcome.failure(new ApiException(
                HttpStatus.CONFLICT,
                "OPERATION_IN_PROGRESS",
                "A workflow operation with the same idempotency key is still in progress."));
    }

    private Map<String, Object> recoveryForFailedReplay(WorkflowOperationRecord operation, String errorCode) {
        if (!"ANALYSIS_ALREADY_GENERATED".equals(errorCode) || operation.workflowId() == null) {
            return Map.of();
        }
        return workflowRepository.findById(operation.workflowId())
                .map(WorkflowRecord::currentReportId)
                .filter(reportId -> reportId != null && !reportId.isBlank())
                .map(reportId -> Map.<String, Object>of("currentReportId", reportId))
                .orElse(Map.of());
    }

    private String safeReplayMessage(String errorCode) {
        return switch (errorCode) {
            case "ANALYSIS_ALREADY_GENERATED" -> "Analysis was already generated for this workflow.";
            case "ANALYSIS_PERSISTENCE_FAILED" -> "Analysis report could not be persisted safely.";
            case "UNSUPPORTED_ANALYSIS_MARKET" -> "Confirmed snapshot contains an unsupported market or selection.";
            case "SNAPSHOT_NOT_AUTHORITATIVE" -> "Snapshot is not a server-confirmed v2 analysis authority.";
            default -> "The previous analysis operation failed and will not be retried automatically.";
        };
    }

    private void completeDeterministicFailure(String idempotencyKey, ApiException exception, String now) {
        boolean completed = operationService.completeFailure(
                idempotencyKey,
                exception.errorCode(),
                exception.status().value(),
                now);
        if (!completed) {
            throw new IllegalStateException("Analysis operation failure update failed.");
        }
    }

    private HttpStatus resolveStatus(Integer storedStatus, HttpStatus fallback) {
        if (storedStatus == null) {
            return fallback;
        }
        HttpStatus resolved = HttpStatus.resolve(storedStatus);
        return resolved == null ? fallback : resolved;
    }

    private ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    private String now() {
        return OffsetDateTime.now(DEFAULT_ZONE).toString();
    }

    private record PreparedRuleAnalysis(
            WorkflowRecord workflow,
            UserConfirmedSnapshotResponse snapshot,
            AuthoritativeAnalysisInput input,
            StrategyParameterRequest strategyParameters,
            String defaultsVersion) {
    }

    public record RuleGenerationOutcome(
            HttpStatus httpStatus,
            AnalysisReportResponse report,
            ApiException failure) {

        static RuleGenerationOutcome success(HttpStatus status, AnalysisReportResponse report) {
            return new RuleGenerationOutcome(status, report, null);
        }

        static RuleGenerationOutcome failure(ApiException failure) {
            return new RuleGenerationOutcome(failure.status(), null, failure);
        }
    }
}
