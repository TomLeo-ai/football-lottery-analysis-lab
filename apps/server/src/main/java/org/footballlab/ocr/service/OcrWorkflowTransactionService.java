package org.footballlab.ocr.service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.footballlab.common.error.ApiException;
import org.footballlab.common.error.ApiFieldError;
import org.footballlab.ocr.domain.OcrWorkflowCreateRequest;
import org.footballlab.ocr.domain.OcrWorkflowResponse;
import org.footballlab.ocr.domain.ScreenshotTaskResponse;
import org.footballlab.ocr.repository.OcrWorkflowRepository;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.domain.WorkflowRecord;
import org.footballlab.workflow.domain.WorkflowStage;
import org.footballlab.workflow.repository.WorkflowRepository;
import org.footballlab.workflow.service.RequestHashService;
import org.footballlab.workflow.service.WorkflowOperationService;
import org.footballlab.workflow.service.WorkflowOperationService.ReservationStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OcrWorkflowTransactionService {

    public static final String IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final String SOURCE_DECLARATION = "FICTIONAL_SAMPLE";
    private static final String SOURCE_POLICY_VERSION = "SOURCE_POLICY_V2";
    private static final String WAITING_LOCAL_OCR = "WAITING_LOCAL_OCR";
    private static final String PRIVACY_POLICY = "截图仅用于用户本地 OCR 与人工确认；OCR 结果不作为公共官方数据源。";
    private static final long MAX_DECLARED_IMAGE_BYTES = 20L * 1024L * 1024L;

    private final WorkflowRepository workflowRepository;
    private final WorkflowOperationService operationService;
    private final RequestHashService requestHashService;
    private final OcrWorkflowRepository ocrWorkflowRepository;

    public OcrWorkflowTransactionService(
            WorkflowRepository workflowRepository,
            WorkflowOperationService operationService,
            RequestHashService requestHashService,
            OcrWorkflowRepository ocrWorkflowRepository
    ) {
        this.workflowRepository = workflowRepository;
        this.operationService = operationService;
        this.requestHashService = requestHashService;
        this.ocrWorkflowRepository = ocrWorkflowRepository;
    }

    @Transactional
    public WorkflowCreateResult createWorkflow(OcrWorkflowCreateRequest request, String idempotencyKey) {
        validateIdempotencyKey(idempotencyKey);
        validateCreateRequest(request);
        String requestHash = requestHashService.hash(
                WorkflowOperationType.CREATE_WORKFLOW,
                "POST",
                "/api/ocr/workflows",
                createHashFields(request));
        String now = now();
        var reservation = operationService.reserve(
                idempotencyKey,
                null,
                WorkflowOperationType.CREATE_WORKFLOW,
                requestHash,
                now);
        if (reservation.status() == ReservationStatus.REPLAY) {
            return new WorkflowCreateResult(
                    reservation.operation().httpStatus() == null ? HttpStatus.OK : HttpStatus.valueOf(reservation.operation().httpStatus()),
                    getWorkflow(reservation.operation().resultId()));
        }
        if (reservation.status() == ReservationStatus.IN_PROGRESS) {
            throw operationInProgress();
        }

        String workflowId = "workflow-" + UUID.randomUUID();
        String screenshotTaskId = "screenshot-" + UUID.randomUUID();
        WorkflowRecord workflow = new WorkflowRecord(
                workflowId,
                WorkflowStage.WAITING_LOCAL_OCR,
                0L,
                null,
                null,
                null,
                null,
                null,
                null,
                now,
                now);
        workflowRepository.create(workflow);
        ocrWorkflowRepository.saveWorkflowScreenshotTask(
                workflowId,
                new ScreenshotTaskResponse(
                        screenshotTaskId,
                        "local-image",
                        request.getContentType(),
                        request.getByteSize(),
                        SOURCE_DECLARATION,
                        WAITING_LOCAL_OCR,
                        false,
                        PRIVACY_POLICY,
                        now),
                request.getSourceDeclaration(),
                request.getSourcePolicyVersion());
        operationService.attachWorkflow(idempotencyKey, workflowId, now);
        operationService.completeSuccess(idempotencyKey, "WORKFLOW", workflowId, HttpStatus.CREATED.value(), now);
        return new WorkflowCreateResult(HttpStatus.CREATED, getWorkflow(workflowId));
    }

    @Transactional(readOnly = true)
    public OcrWorkflowResponse getWorkflow(String workflowId) {
        WorkflowRecord workflow = workflowRepository.findById(workflowId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "WORKFLOW_NOT_FOUND",
                        "OCR workflow was not found."));
        String screenshotTaskId = ocrWorkflowRepository.findScreenshotTaskByWorkflowId(workflowId)
                .map(ScreenshotTaskResponse::taskId)
                .orElse(null);
        return new OcrWorkflowResponse(
                workflow.workflowId(),
                workflow.currentStage().name(),
                workflow.version(),
                screenshotTaskId,
                workflow.currentOcrTaskId(),
                workflow.confirmedSnapshotId(),
                workflow.currentReportId(),
                workflow.currentPlanId(),
                workflow.createdAt(),
                workflow.updatedAt());
    }

    @Transactional
    public void abandonWorkflow(String workflowId, String idempotencyKey) {
        validateIdempotencyKey(idempotencyKey);
        WorkflowRecord workflow = workflowRepository.findById(workflowId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "WORKFLOW_NOT_FOUND",
                        "OCR workflow was not found."));
        String requestHash = requestHashService.hash(
                WorkflowOperationType.ABANDON_WORKFLOW,
                "DELETE",
                "/api/ocr/workflows/" + workflowId,
                Map.of("workflowId", workflowId));
        String now = now();
        var reservation = operationService.reserve(
                idempotencyKey,
                workflowId,
                WorkflowOperationType.ABANDON_WORKFLOW,
                requestHash,
                now);
        if (reservation.status() == ReservationStatus.REPLAY) {
            return;
        }
        if (reservation.status() == ReservationStatus.IN_PROGRESS) {
            throw operationInProgress();
        }
        if (workflow.currentStage() == WorkflowStage.CONFIRMED || workflow.currentStage() == WorkflowStage.ABANDONED) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "WORKFLOW_NOT_ABANDONABLE",
                    "Workflow can only be abandoned before confirmation.");
        }
        boolean updated = workflowRepository.transition(
                workflowId,
                workflow.version(),
                workflow.currentStage(),
                WorkflowStage.ABANDONED,
                workflow.currentOcrTaskId(),
                workflow.confirmedSnapshotId(),
                workflow.currentReportId(),
                workflow.currentPlanId(),
                now);
        if (!updated) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "WORKFLOW_VERSION_CONFLICT",
                    "Workflow was updated by another request.");
        }
        ocrWorkflowRepository.clearWorkflowPayloads(workflowId);
        operationService.completeSuccess(idempotencyKey, "WORKFLOW", workflowId, HttpStatus.NO_CONTENT.value(), now);
    }

    private void validateCreateRequest(OcrWorkflowCreateRequest request) {
        if (request == null) {
            throw validationFailed(List.of(new ApiFieldError("body", "Request body is required.")));
        }
        new CreateRequestValidator(request).validate();
    }

    private void validateIdempotencyKey(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_IDEMPOTENCY_KEY",
                    "A UUID Idempotency-Key header is required.");
        }
        try {
            UUID.fromString(idempotencyKey);
        } catch (IllegalArgumentException exception) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_IDEMPOTENCY_KEY",
                    "A UUID Idempotency-Key header is required.");
        }
    }

    private Map<String, Object> createHashFields(OcrWorkflowCreateRequest request) {
        return Map.of(
                "sourceDeclaration", request.getSourceDeclaration(),
                "sourcePolicyVersion", request.getSourcePolicyVersion(),
                "contentType", request.getContentType(),
                "byteSize", request.getByteSize(),
                "width", request.getWidth(),
                "height", request.getHeight());
    }

    private ApiException operationInProgress() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "OPERATION_IN_PROGRESS",
                "A workflow operation with the same idempotency key is still in progress.");
    }

    private ApiException validationFailed(List<ApiFieldError> fieldErrors) {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                "Request validation failed.",
                fieldErrors,
                Map.of());
    }

    private String now() {
        return OffsetDateTime.now(DEFAULT_ZONE).toString();
    }

    public record WorkflowCreateResult(HttpStatus httpStatus, OcrWorkflowResponse workflow) {
    }

    private final class CreateRequestValidator {

        private final OcrWorkflowCreateRequest request;

        private CreateRequestValidator(OcrWorkflowCreateRequest request) {
            this.request = request;
        }

        private void validate() {
            List<ApiFieldError> errors = new java.util.ArrayList<>();
            if (!SOURCE_DECLARATION.equals(request.getSourceDeclaration())) {
                errors.add(new ApiFieldError("sourceDeclaration", "sourceDeclaration must be FICTIONAL_SAMPLE."));
            }
            if (!SOURCE_POLICY_VERSION.equals(request.getSourcePolicyVersion())) {
                errors.add(new ApiFieldError("sourcePolicyVersion", "sourcePolicyVersion must be SOURCE_POLICY_V2."));
            }
            if (!isSupportedContentType(request.getContentType())) {
                errors.add(new ApiFieldError("contentType", "contentType must be image/png, image/jpeg, or image/webp."));
            }
            if (request.getByteSize() <= 0 || request.getByteSize() > MAX_DECLARED_IMAGE_BYTES) {
                errors.add(new ApiFieldError("byteSize", "byteSize must be between 1 and 20971520."));
            }
            if (request.getWidth() <= 0 || request.getWidth() > 10000) {
                errors.add(new ApiFieldError("width", "width must be between 1 and 10000."));
            }
            if (request.getHeight() <= 0 || request.getHeight() > 10000) {
                errors.add(new ApiFieldError("height", "height must be between 1 and 10000."));
            }
            if (!errors.isEmpty()) {
                throw validationFailed(errors);
            }
        }

        private boolean isSupportedContentType(String contentType) {
            return "image/png".equals(contentType)
                    || "image/jpeg".equals(contentType)
                    || "image/webp".equals(contentType);
        }
    }
}
