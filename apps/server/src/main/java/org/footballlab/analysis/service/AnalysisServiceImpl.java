package org.footballlab.analysis.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ResolvedAnalysisEngineConfiguration;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.common.error.ApiException;
import org.footballlab.common.error.ApiFieldError;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.footballlab.ocr.repository.OcrWorkflowRepository;
import org.footballlab.strategy.domain.ResolvedStrategyParameters;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.footballlab.strategy.service.AnalysisOptionsResolver;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.service.RequestHashService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AnalysisServiceImpl implements AnalysisService {

    private static final String GENERATE_PATH = "/api/analysis/generate";

    private final AnalysisReportRepository analysisReportRepository;
    private final OcrWorkflowRepository ocrWorkflowRepository;
    private final AnalysisOptionsResolver analysisOptionsResolver;
    private final AnalysisEngineConfigurationResolver engineConfigurationResolver;
    private final RequestHashService requestHashService;
    private final AnalysisTransactionCoordinator transactionCoordinator;
    private final OpenAiCompatibleAnalysisEngine externalEngine;

    public AnalysisServiceImpl(
            AnalysisReportRepository analysisReportRepository,
            OcrWorkflowRepository ocrWorkflowRepository,
            AnalysisOptionsResolver analysisOptionsResolver,
            AnalysisEngineConfigurationResolver engineConfigurationResolver,
            RequestHashService requestHashService,
            AnalysisTransactionCoordinator transactionCoordinator,
            OpenAiCompatibleAnalysisEngine externalEngine) {
        this.analysisReportRepository = analysisReportRepository;
        this.ocrWorkflowRepository = ocrWorkflowRepository;
        this.analysisOptionsResolver = analysisOptionsResolver;
        this.engineConfigurationResolver = engineConfigurationResolver;
        this.requestHashService = requestHashService;
        this.transactionCoordinator = transactionCoordinator;
        this.externalEngine = externalEngine;
    }

    @Override
    public AnalysisGenerationResult generateAnalysis(AnalysisGenerateRequest request, String idempotencyKey) {
        validateIdempotencyKey(idempotencyKey);
        validateRequest(request);
        ResolvedAnalysisEngineConfiguration engineConfiguration = resolveEngineConfiguration(request);
        UserConfirmedSnapshotResponse hashSnapshot = ocrWorkflowRepository.findConfirmedSnapshot(request.snapshotId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "SNAPSHOT_NOT_FOUND",
                        "Confirmed snapshot was not found."));
        ResolvedStrategyParameters resolvedOptions = resolveOptions(request, hashSnapshot);
        StrategyParameterRequest strategyParameters = AnalysisTransactionCoordinator.toStrategyParameters(resolvedOptions);
        WorkflowOperationType operationType = MockRuleAnalysisEngine.ENGINE_MODE.equals(engineConfiguration.engineMode())
                ? WorkflowOperationType.GENERATE_REPORT
                : WorkflowOperationType.GENERATE_ANALYSIS;
        String requestHash = requestHashService.hash(
                operationType,
                "POST",
                GENERATE_PATH,
                canonicalHashFields(
                        request.snapshotId(),
                        engineConfiguration,
                        strategyParameters,
                        resolvedOptions.defaultsVersion()));

        if (MockRuleAnalysisEngine.ENGINE_MODE.equals(engineConfiguration.engineMode())) {
            return generateRuleAnalysis(
                    idempotencyKey,
                    request,
                    hashSnapshot,
                    requestHash,
                    engineConfiguration,
                    strategyParameters,
                    resolvedOptions.defaultsVersion());
        }

        AnalysisTransactionCoordinator.ExternalClaimOutcome claim = transactionCoordinator.claimExternalAnalysis(
                idempotencyKey,
                request,
                hashSnapshot.workflowId(),
                requestHash,
                engineConfiguration,
                strategyParameters,
                resolvedOptions.defaultsVersion());
        if (claim.failure() != null) {
            throw claim.failure();
        }
        if (claim.report() != null) {
            return new AnalysisGenerationResult(claim.httpStatus(), claim.report());
        }
        AnalysisEngineResult generated;
        try {
            generated = externalEngine.generate(claim.prepared().toEngineContext());
        } catch (AnalysisEngineInvocationException failure) {
            try {
                transactionCoordinator.failExternalAnalysis(claim.prepared(), failure);
            } catch (RuntimeException completionFailure) {
                interruptBestEffort(claim.prepared());
                throw interruptedOperation();
            }
            throw new ApiException(failure.status(), failure.errorCode(), failure.safeMessage());
        }
        try {
            AnalysisReportResponse report = transactionCoordinator.completeExternalAnalysis(claim.prepared(), generated);
            return new AnalysisGenerationResult(HttpStatus.CREATED, report);
        } catch (RuntimeException completionFailure) {
            interruptBestEffort(claim.prepared());
            throw interruptedOperation();
        }
    }

    private AnalysisGenerationResult generateRuleAnalysis(
            String idempotencyKey,
            AnalysisGenerateRequest request,
            UserConfirmedSnapshotResponse hashSnapshot,
            String requestHash,
            ResolvedAnalysisEngineConfiguration engineConfiguration,
            StrategyParameterRequest strategyParameters,
            String defaultsVersion) {
        try {
            AnalysisTransactionCoordinator.RuleGenerationOutcome outcome =
                    transactionCoordinator.generateRuleInSingleTransaction(
                            idempotencyKey,
                            request,
                            hashSnapshot.workflowId(),
                            requestHash,
                            engineConfiguration,
                            strategyParameters,
                            defaultsVersion);
            if (outcome.failure() != null) {
                throw outcome.failure();
            }
            return new AnalysisGenerationResult(outcome.httpStatus(), outcome.report());
        } catch (ApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            try {
                transactionCoordinator.recordPersistenceFailureRequiresNew(
                        idempotencyKey,
                        hashSnapshot.workflowId(),
                        requestHash);
            } catch (RuntimeException ignored) {
                // The original persistence error remains authoritative; failure recording is best effort.
            }
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "ANALYSIS_PERSISTENCE_FAILED",
                    "Analysis report could not be persisted safely.");
        }
    }

    @Override
    public AnalysisReportResponse getReport(String reportId) {
        return analysisReportRepository.findAnyById(reportId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Analysis report not found."));
    }

    private ResolvedAnalysisEngineConfiguration resolveEngineConfiguration(AnalysisGenerateRequest request) {
        try {
            return engineConfigurationResolver.resolve(
                    request.engineMode(),
                    request.providerKey(),
                    request.modelId(),
                    request.promptVersion());
        } catch (ResponseStatusException exception) {
            throw invalidRequest(exception.getReason());
        }
    }

    private ResolvedStrategyParameters resolveOptions(
            AnalysisGenerateRequest request,
            UserConfirmedSnapshotResponse snapshot) {
        try {
            int matchCount = snapshot.matches() == null ? 0 : snapshot.matches().size();
            return analysisOptionsResolver.resolve(
                    request.analysisOptions(),
                    snapshot.budgetAmount(),
                    snapshot.currency(),
                    snapshot.riskPreference(),
                    matchCount);
        } catch (ResponseStatusException exception) {
            throw invalidRequest(exception.getReason());
        }
    }

    private Map<String, Object> canonicalHashFields(
            String snapshotId,
            ResolvedAnalysisEngineConfiguration configuration,
            StrategyParameterRequest parameters,
            String defaultsVersion) {
        Map<String, Object> engine = new LinkedHashMap<>();
        engine.put("engineMode", configuration.engineMode());
        engine.put("providerKey", configuration.providerKey());
        engine.put("modelId", configuration.modelId());
        engine.put("promptVersion", configuration.promptVersion());

        Map<String, Object> options = new LinkedHashMap<>();
        options.put("budgetAmount", parameters.budgetAmount());
        options.put("currency", parameters.currency());
        options.put("targetTicketCount", parameters.targetTicketCount());
        options.put("minTicketCount", parameters.minTicketCount());
        options.put("maxTicketCount", parameters.maxTicketCount());
        options.put("riskPreference", parameters.riskPreference());
        options.put("mainTicketRatio", parameters.mainTicketRatio());
        options.put("defensiveTicketRatio", parameters.defensiveTicketRatio());
        options.put("entertainmentTicketRatio", parameters.entertainmentTicketRatio());
        options.put("enableEntertainmentTicket", parameters.enableEntertainmentTicket());
        options.put("entertainmentTicketMaxCost", parameters.entertainmentTicketMaxCost());
        options.put("maxParlayLegs", parameters.maxParlayLegs());
        options.put("preferredPlayTypes", parameters.preferredPlayTypes());
        options.put("excludedPlayTypes", parameters.excludedPlayTypes());
        options.put("exactScorePolicy", parameters.exactScorePolicy());
        options.put("minPayoutRequirement", parameters.minPayoutRequirement());
        options.put("allowLowReturnTicket", parameters.allowLowReturnTicket());
        options.put("upsetCoverageLevel", parameters.upsetCoverageLevel());
        options.put("defaultsVersion", defaultsVersion);

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("snapshotId", snapshotId);
        fields.put("engineConfiguration", engine);
        fields.put("resolvedOptions", options);
        return fields;
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

    private void validateRequest(AnalysisGenerateRequest request) {
        if (request == null) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_FAILED",
                    "Request validation failed.",
                    List.of(new ApiFieldError("body", "Request body is required.")),
                    Map.of());
        }
        if (request.snapshotId() == null || request.snapshotId().isBlank()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_FAILED",
                    "Request validation failed.",
                    List.of(new ApiFieldError("snapshotId", "snapshotId is required.")),
                    Map.of());
        }
    }

    private ApiException invalidIdempotencyKey() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_IDEMPOTENCY_KEY",
                "A UUID Idempotency-Key header is required.");
    }

    private void interruptBestEffort(PreparedAnalysisOperation prepared) {
        try {
            transactionCoordinator.interruptExternalAnalysisRequiresNew(prepared);
        } catch (RuntimeException ignored) {
            // Startup stale-operation recovery will retry the matching claim transition.
        }
    }

    private ApiException interruptedOperation() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "OPERATION_INTERRUPTED",
                "The external analysis operation was interrupted and will not be retried automatically.");
    }

    private ApiException invalidRequest(String message) {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_ANALYSIS_REQUEST",
                message == null || message.isBlank() ? "Analysis request is invalid." : message);
    }
}
