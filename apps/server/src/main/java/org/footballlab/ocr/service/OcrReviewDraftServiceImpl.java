package org.footballlab.ocr.service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.common.error.ApiException;
import org.footballlab.ocr.domain.DraftMarketRequest;
import org.footballlab.ocr.domain.DraftMatchRequest;
import org.footballlab.ocr.domain.OcrReviewDraftResponse;
import org.footballlab.ocr.domain.OcrReviewDraftUpdateRequest;
import org.footballlab.ocr.repository.OcrReviewDraftRepository;
import org.footballlab.ocr.repository.OcrReviewDraftRepository.DraftRecord;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.service.RequestHashService;
import org.footballlab.workflow.service.WorkflowOperationService;
import org.footballlab.workflow.service.WorkflowOperationService.ReservationStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OcrReviewDraftServiceImpl implements OcrReviewDraftService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final String IDEMPOTENCY_KEY_HEADER_MESSAGE = "A UUID Idempotency-Key header is required.";

    private final OcrReviewDraftRepository draftRepository;
    private final OcrDraftValidator draftValidator;
    private final WorkflowOperationService operationService;
    private final RequestHashService requestHashService;
    private final ObjectMapper objectMapper;

    public OcrReviewDraftServiceImpl(
            OcrReviewDraftRepository draftRepository,
            OcrDraftValidator draftValidator,
            WorkflowOperationService operationService,
            RequestHashService requestHashService,
            ObjectMapper objectMapper
    ) {
        this.draftRepository = draftRepository;
        this.draftValidator = draftValidator;
        this.operationService = operationService;
        this.requestHashService = requestHashService;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public OcrReviewDraftResponse getDraft(String ocrTaskId) {
        DraftRecord draft = draftRepository.findActiveDraft(ocrTaskId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "DRAFT_NOT_FOUND",
                        "OCR review draft was not found."));
        return toResponse(draft);
    }

    @Override
    @Transactional
    public OcrReviewDraftResponse saveDraft(
            String ocrTaskId,
            OcrReviewDraftUpdateRequest request,
            String idempotencyKey
    ) {
        validateIdempotencyKey(idempotencyKey);
        draftValidator.validate(request);
        DraftRecord current = draftRepository.findActiveDraft(ocrTaskId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "DRAFT_NOT_FOUND",
                        "OCR review draft was not found."));
        String requestHash = requestHashService.hash(
                WorkflowOperationType.SAVE_DRAFT,
                "PUT",
                "/api/ocr/review-drafts/" + ocrTaskId,
                Map.of(
                        "ocrTaskId", ocrTaskId,
                        "expectedRevision", request.getExpectedRevision(),
                        "riskPreference", request.getRiskPreference(),
                        "budgetAmount", request.getBudgetAmount(),
                        "currency", request.getCurrency(),
                        "matches", request.getMatches(),
                        "markets", request.getMarkets()));
        String now = now();
        var reservation = operationService.reserve(
                idempotencyKey,
                current.workflowId(),
                WorkflowOperationType.SAVE_DRAFT,
                requestHash,
                now);
        if (reservation.status() == ReservationStatus.REPLAY) {
            return toResponse(draftRepository.findActiveDraft(ocrTaskId).orElseThrow());
        }
        if (reservation.status() == ReservationStatus.IN_PROGRESS) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "OPERATION_IN_PROGRESS",
                    "A workflow operation with the same idempotency key is still in progress.");
        }
        boolean updated = draftRepository.updateDraft(
                ocrTaskId,
                current.workflowId(),
                request.getExpectedRevision(),
                request.getRiskPreference(),
                request.getBudgetAmount(),
                request.getCurrency(),
                toJson(request.getMatches()),
                toJson(request.getMarkets()),
                now);
        if (!updated) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "DRAFT_REVISION_CONFLICT",
                    "Draft revision is stale.");
        }
        operationService.completeSuccess(idempotencyKey, "OCR_REVIEW_DRAFT", ocrTaskId, HttpStatus.OK.value(), now);
        return toResponse(draftRepository.findActiveDraft(ocrTaskId).orElseThrow());
    }

    private OcrReviewDraftResponse toResponse(DraftRecord record) {
        return new OcrReviewDraftResponse(
                record.ocrTaskId(),
                record.workflowId(),
                record.revision(),
                record.draftStatus(),
                record.riskPreference(),
                record.budgetAmount(),
                record.currency(),
                fromJsonList(record.matchesJson(), new TypeReference<List<DraftMatchRequest>>() {
                }),
                fromJsonList(record.marketsJson(), new TypeReference<List<DraftMarketRequest>>() {
                }),
                record.schemaVersion(),
                record.updatedAt());
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
                IDEMPOTENCY_KEY_HEADER_MESSAGE);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize OCR review draft payload.", exception);
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
