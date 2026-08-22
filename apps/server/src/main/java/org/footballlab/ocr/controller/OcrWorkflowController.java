package org.footballlab.ocr.controller;

import org.footballlab.common.Result;
import org.footballlab.common.error.ApiException;
import org.footballlab.ocr.domain.LocalOcrParseRequest;
import org.footballlab.ocr.domain.OcrCandidateParseRequest;
import org.footballlab.ocr.domain.OcrWorkflowCreateRequest;
import org.footballlab.ocr.domain.OcrWorkflowResponse;
import org.footballlab.ocr.domain.OcrTaskResponse;
import org.footballlab.ocr.domain.ScreenshotTaskCreateRequest;
import org.footballlab.ocr.domain.ScreenshotTaskResponse;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.footballlab.ocr.service.OcrConfirmationService;
import org.footballlab.ocr.service.OcrWorkflowService;
import org.footballlab.ocr.service.OcrWorkflowTransactionService;
import org.footballlab.ocr.service.OcrWorkflowTransactionService.WorkflowCreateResult;
import org.footballlab.ocr.service.OcrWorkflowTransactionService.WorkflowOcrResult;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OcrWorkflowController {

    private final OcrWorkflowService ocrWorkflowService;
    private final OcrWorkflowTransactionService workflowTransactionService;
    private final OcrConfirmationService confirmationService;

    public OcrWorkflowController(
            OcrWorkflowService ocrWorkflowService,
            OcrWorkflowTransactionService workflowTransactionService,
            OcrConfirmationService confirmationService
    ) {
        this.ocrWorkflowService = ocrWorkflowService;
        this.workflowTransactionService = workflowTransactionService;
        this.confirmationService = confirmationService;
    }

    @PostMapping("/api/ocr/workflows")
    public ResponseEntity<Result<OcrWorkflowResponse>> createWorkflow(
            @RequestHeader(value = OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
            @RequestBody OcrWorkflowCreateRequest request
    ) {
        WorkflowCreateResult result = workflowTransactionService.createWorkflow(request, idempotencyKey);
        return ResponseEntity
                .status(result.httpStatus())
                .body(Result.success(result.httpStatus().value(), result.workflow()));
    }

    @GetMapping("/api/ocr/workflows/{workflowId}")
    public Result<OcrWorkflowResponse> getWorkflow(@PathVariable String workflowId) {
        return Result.success(workflowTransactionService.getWorkflow(workflowId));
    }

    @PostMapping("/api/ocr/workflows/{workflowId}/ocr-candidates")
    public ResponseEntity<Result<OcrTaskResponse>> parseOcrCandidates(
            @PathVariable String workflowId,
            @RequestHeader(value = OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
            @RequestBody OcrCandidateParseRequest request
    ) {
        WorkflowOcrResult result = workflowTransactionService.parseOcrCandidates(workflowId, request, idempotencyKey);
        return ResponseEntity
                .status(result.httpStatus())
                .body(Result.success(result.httpStatus().value(), result.ocrTask()));
    }

    @DeleteMapping("/api/ocr/workflows/{workflowId}")
    public ResponseEntity<Void> abandonWorkflow(
            @PathVariable String workflowId,
            @RequestHeader(value = OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey
    ) {
        workflowTransactionService.abandonWorkflow(workflowId, idempotencyKey);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/screenshots/tasks")
    public Result<ScreenshotTaskResponse> createScreenshotTask(@RequestBody ScreenshotTaskCreateRequest request) {
        return Result.success(ocrWorkflowService.createScreenshotTask(request));
    }

    @PostMapping("/api/ocr/parse-local-result")
    public Result<OcrTaskResponse> parseLocalOcrResult(@RequestBody LocalOcrParseRequest request) {
        return Result.success(ocrWorkflowService.parseLocalOcrResult(request));
    }

    @GetMapping("/api/ocr/snapshots/{snapshotId}")
    public Result<UserConfirmedSnapshotResponse> getSnapshot(@PathVariable String snapshotId) {
        return Result.success(confirmationService.getSnapshot(snapshotId));
    }

    @PostMapping("/api/ocr/review/confirm")
    public Result<Void> confirmReviewLegacyTombstone() {
        throw new ApiException(
                HttpStatus.GONE,
                "LEGACY_CONFIRM_ENDPOINT_REMOVED",
                "Use the revisioned OCR review draft confirmation endpoint.");
    }
}

