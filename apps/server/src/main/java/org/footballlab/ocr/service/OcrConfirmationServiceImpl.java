package org.footballlab.ocr.service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.common.error.ApiException;
import org.footballlab.common.error.ApiFieldError;
import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;
import org.footballlab.ocr.domain.DraftMarketRequest;
import org.footballlab.ocr.domain.DraftMatchRequest;
import org.footballlab.ocr.domain.OcrReviewConfirmRequest;
import org.footballlab.ocr.domain.OcrReviewDraftUpdateRequest;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.footballlab.ocr.persistence.ConfirmedSnapshotPayloadV2;
import org.footballlab.ocr.repository.OcrReviewDraftRepository;
import org.footballlab.ocr.repository.OcrReviewDraftRepository.DraftRecord;
import org.footballlab.ocr.repository.OcrWorkflowRepository;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.domain.WorkflowRecord;
import org.footballlab.workflow.domain.WorkflowStage;
import org.footballlab.workflow.repository.WorkflowRepository;
import org.footballlab.workflow.service.RequestHashService;
import org.footballlab.workflow.service.WorkflowOperationService;
import org.footballlab.workflow.service.WorkflowOperationService.ReservationStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OcrConfirmationServiceImpl implements OcrConfirmationService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final String USER_SCREENSHOT_CONFIRMED = "USER_SCREENSHOT_CONFIRMED";
    private static final String CONFIRMED = "CONFIRMED";
    private static final String SERVER_CONFIRMED_V2 = "SERVER_CONFIRMED_V2";
    private static final String CONFIRMED_SNAPSHOT_V2 = "CONFIRMED_SNAPSHOT_V2";

    private final OcrWorkflowRepository ocrWorkflowRepository;
    private final OcrReviewDraftRepository draftRepository;
    private final WorkflowRepository workflowRepository;
    private final WorkflowOperationService operationService;
    private final RequestHashService requestHashService;
    private final OcrDraftValidator draftValidator;
    private final ObjectMapper objectMapper;

    public OcrConfirmationServiceImpl(
            OcrWorkflowRepository ocrWorkflowRepository,
            OcrReviewDraftRepository draftRepository,
            WorkflowRepository workflowRepository,
            WorkflowOperationService operationService,
            RequestHashService requestHashService,
            OcrDraftValidator draftValidator,
            ObjectMapper objectMapper
    ) {
        this.ocrWorkflowRepository = ocrWorkflowRepository;
        this.draftRepository = draftRepository;
        this.workflowRepository = workflowRepository;
        this.operationService = operationService;
        this.requestHashService = requestHashService;
        this.draftValidator = draftValidator;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public ConfirmationResult confirmDraft(String ocrTaskId, OcrReviewConfirmRequest request, String idempotencyKey) {
        validateIdempotencyKey(idempotencyKey);
        validateConfirmRequest(request);
        String workflowId = ocrWorkflowRepository.findWorkflowIdByOcrTaskId(ocrTaskId)
                .filter(value -> !value.isBlank())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "OCR_TASK_NOT_FOUND",
                        "OCR task was not found in a v2 workflow."));
        String requestHash = requestHashService.hash(
                WorkflowOperationType.CONFIRM_SNAPSHOT,
                "POST",
                "/api/ocr/review-drafts/" + ocrTaskId + "/confirm",
                Map.of(
                        "ocrTaskId", ocrTaskId,
                        "expectedRevision", request.getExpectedRevision()));
        String now = now();
        var reservation = operationService.reserve(
                idempotencyKey,
                workflowId,
                WorkflowOperationType.CONFIRM_SNAPSHOT,
                requestHash,
                now);
        if (reservation.status() == ReservationStatus.REPLAY) {
            return new ConfirmationResult(
                    reservation.operation().httpStatus() == null ? HttpStatus.OK : HttpStatus.valueOf(reservation.operation().httpStatus()),
                    getSnapshot(reservation.operation().resultId()));
        }
        if (reservation.status() == ReservationStatus.IN_PROGRESS) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "OPERATION_IN_PROGRESS",
                    "A workflow operation with the same idempotency key is still in progress.");
        }

        WorkflowRecord workflow = workflowRepository.findById(workflowId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "WORKFLOW_NOT_FOUND",
                        "OCR workflow was not found."));
        if (workflow.currentStage() == WorkflowStage.CONFIRMED) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "WORKFLOW_ALREADY_CONFIRMED",
                    "Workflow is already confirmed.");
        }
        if (workflow.currentStage() != WorkflowStage.WAITING_USER_CONFIRMATION
                || !ocrTaskId.equals(workflow.currentOcrTaskId())) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "WORKFLOW_STAGE_CONFLICT",
                    "Workflow is not ready for snapshot confirmation.");
        }

        DraftRecord draft = draftRepository.findActiveDraft(ocrTaskId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "DRAFT_NOT_FOUND",
                        "Active OCR review draft was not found."));
        if (draft.revision() != request.getExpectedRevision()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "DRAFT_REVISION_CONFLICT",
                    "Draft revision is stale.",
                    List.of(),
                    Map.of("currentRevision", draft.revision()));
        }

        List<DraftMatchRequest> draftMatches = fromJsonList(draft.matchesJson(), new TypeReference<List<DraftMatchRequest>>() {
        });
        List<DraftMarketRequest> draftMarkets = fromJsonList(draft.marketsJson(), new TypeReference<List<DraftMarketRequest>>() {
        });
        validateConfirmableDraft(draft, draftMatches, draftMarkets);

        Map<String, String> formalMatchIds = new LinkedHashMap<>();
        List<ConfirmedMatchResponse> confirmedMatches = draftMatches.stream()
                .map(match -> {
                    String formalMatchId = "match-" + UUID.randomUUID();
                    formalMatchIds.put(match.getMatchId(), formalMatchId);
                    return new ConfirmedMatchResponse(
                            formalMatchId,
                            match.getMatchDate(),
                            match.getLeague(),
                            match.getHomeTeam(),
                            match.getAwayTeam(),
                            match.getKickoffTime());
                })
                .toList();
        List<ConfirmedMarketResponse> confirmedMarkets = draftMarkets.stream()
                .map(market -> new ConfirmedMarketResponse(
                        "market-" + UUID.randomUUID(),
                        formalMatchIds.get(market.getMatchId()),
                        market.getPlayType(),
                        market.getSelection(),
                        market.getOdds()))
                .toList();

        String snapshotId = "snapshot-" + UUID.randomUUID();
        UserConfirmedSnapshotResponse snapshot = new UserConfirmedSnapshotResponse(
                snapshotId,
                ocrTaskId,
                USER_SCREENSHOT_CONFIRMED,
                CONFIRMED,
                true,
                draft.riskPreference(),
                draft.budgetAmount(),
                draft.currency(),
                confirmedMatches,
                confirmedMarkets,
                now,
                workflowId,
                draft.revision(),
                SERVER_CONFIRMED_V2,
                CONFIRMED_SNAPSHOT_V2);
        ConfirmedSnapshotPayloadV2 payload = new ConfirmedSnapshotPayloadV2(
                CONFIRMED_SNAPSHOT_V2,
                workflowId,
                ocrTaskId,
                draft.revision(),
                USER_SCREENSHOT_CONFIRMED,
                CONFIRMED,
                true,
                draft.riskPreference(),
                draft.budgetAmount(),
                draft.currency(),
                confirmedMatches,
                confirmedMarkets);
        try {
            ocrWorkflowRepository.saveWorkflowConfirmedSnapshot(workflowId, draft.revision(), snapshot, toJson(payload));
            boolean transitioned = workflowRepository.transition(
                    workflowId,
                    workflow.version(),
                    WorkflowStage.WAITING_USER_CONFIRMATION,
                    WorkflowStage.CONFIRMED,
                    ocrTaskId,
                    snapshotId,
                    workflow.currentReportId(),
                    workflow.currentPlanId(),
                    now);
            if (!transitioned) {
                throw new ApiException(
                        HttpStatus.CONFLICT,
                        "WORKFLOW_VERSION_CONFLICT",
                        "Workflow was updated by another request.");
            }
        } catch (DataIntegrityViolationException exception) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "SNAPSHOT_ALREADY_CONFIRMED",
                    "Workflow snapshot was already confirmed.");
        }
        ocrWorkflowRepository.clearWorkflowOcrPayloadsAndDrafts(workflowId);
        operationService.completeSuccess(idempotencyKey, "CONFIRMED_SNAPSHOT", snapshotId, HttpStatus.CREATED.value(), now);
        return new ConfirmationResult(HttpStatus.CREATED, snapshot);
    }

    @Override
    @Transactional(readOnly = true)
    public UserConfirmedSnapshotResponse getSnapshot(String snapshotId) {
        return ocrWorkflowRepository.findConfirmedSnapshot(snapshotId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "SNAPSHOT_NOT_FOUND",
                        "Confirmed snapshot was not found."));
    }

    private void validateConfirmRequest(OcrReviewConfirmRequest request) {
        if (request == null) {
            throw validationFailed(List.of(new ApiFieldError("body", "Request body is required.")));
        }
        if (request.getExpectedRevision() == null || request.getExpectedRevision() < 0) {
            throw validationFailed(List.of(new ApiFieldError("expectedRevision", "expectedRevision must be zero or greater.")));
        }
    }

    private void validateConfirmableDraft(
            DraftRecord draft,
            List<DraftMatchRequest> draftMatches,
            List<DraftMarketRequest> draftMarkets
    ) {
        OcrReviewDraftUpdateRequest request = new OcrReviewDraftUpdateRequest();
        request.setExpectedRevision(draft.revision());
        request.setRiskPreference(draft.riskPreference());
        request.setBudgetAmount(draft.budgetAmount());
        request.setCurrency(draft.currency());
        request.setMatches(draftMatches);
        request.setMarkets(draftMarkets);
        try {
            draftValidator.validate(request);
        } catch (ApiException exception) {
            throw draftNotConfirmable(exception.fieldErrors());
        }

        List<ApiFieldError> errors = new ArrayList<>();
        if (draftMatches.isEmpty()) {
            errors.add(new ApiFieldError("matches", "At least one confirmed match is required."));
        }
        if (draftMarkets.size() != draftMatches.size()) {
            errors.add(new ApiFieldError("markets", "Every confirmed match must have exactly one market."));
        }
        if (!errors.isEmpty()) {
            throw draftNotConfirmable(errors);
        }
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

    private ApiException invalidIdempotencyKey() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_IDEMPOTENCY_KEY",
                "A UUID Idempotency-Key header is required.");
    }

    private ApiException validationFailed(List<ApiFieldError> fieldErrors) {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                "Request validation failed.",
                fieldErrors,
                Map.of());
    }

    private ApiException draftNotConfirmable(List<ApiFieldError> fieldErrors) {
        return new ApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "DRAFT_NOT_CONFIRMABLE",
                "OCR review draft is not complete enough to confirm.",
                fieldErrors,
                Map.of());
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize confirmed snapshot payload.", exception);
        }
    }

    private <T> T fromJsonList(String json, TypeReference<T> typeReference) {
        try {
            return objectMapper.readValue(json, typeReference);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize OCR review draft payload.", exception);
        }
    }

    private String now() {
        return OffsetDateTime.now(DEFAULT_ZONE).toString();
    }
}
