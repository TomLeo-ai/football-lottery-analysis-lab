package org.footballlab.ocr.controller;

import org.footballlab.common.Result;
import org.footballlab.ocr.domain.OcrReviewConfirmRequest;
import org.footballlab.ocr.domain.OcrReviewDraftResponse;
import org.footballlab.ocr.domain.OcrReviewDraftUpdateRequest;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.footballlab.ocr.service.OcrConfirmationService;
import org.footballlab.ocr.service.OcrReviewDraftService;
import org.footballlab.ocr.service.OcrWorkflowTransactionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OcrReviewDraftController {

    private final OcrReviewDraftService reviewDraftService;
    private final OcrConfirmationService confirmationService;

    public OcrReviewDraftController(
            OcrReviewDraftService reviewDraftService,
            OcrConfirmationService confirmationService
    ) {
        this.reviewDraftService = reviewDraftService;
        this.confirmationService = confirmationService;
    }

    @GetMapping("/api/ocr/review-drafts/{ocrTaskId}")
    public Result<OcrReviewDraftResponse> getDraft(@PathVariable String ocrTaskId) {
        return Result.success(reviewDraftService.getDraft(ocrTaskId));
    }

    @PutMapping("/api/ocr/review-drafts/{ocrTaskId}")
    public Result<OcrReviewDraftResponse> saveDraft(
            @PathVariable String ocrTaskId,
            @RequestHeader(value = OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
            @RequestBody OcrReviewDraftUpdateRequest request
    ) {
        return Result.success(reviewDraftService.saveDraft(ocrTaskId, request, idempotencyKey));
    }

    @PostMapping("/api/ocr/review-drafts/{ocrTaskId}/confirm")
    public ResponseEntity<Result<UserConfirmedSnapshotResponse>> confirmDraft(
            @PathVariable String ocrTaskId,
            @RequestHeader(value = OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
            @RequestBody OcrReviewConfirmRequest request
    ) {
        OcrConfirmationService.ConfirmationResult result = confirmationService.confirmDraft(ocrTaskId, request, idempotencyKey);
        return ResponseEntity
                .status(result.httpStatus())
                .body(Result.success(result.httpStatus().value(), result.snapshot()));
    }
}
