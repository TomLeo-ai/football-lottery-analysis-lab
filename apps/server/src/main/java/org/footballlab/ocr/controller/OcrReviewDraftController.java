package org.footballlab.ocr.controller;

import org.footballlab.common.Result;
import org.footballlab.ocr.domain.OcrReviewDraftResponse;
import org.footballlab.ocr.domain.OcrReviewDraftUpdateRequest;
import org.footballlab.ocr.service.OcrReviewDraftService;
import org.footballlab.ocr.service.OcrWorkflowTransactionService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OcrReviewDraftController {

    private final OcrReviewDraftService reviewDraftService;

    public OcrReviewDraftController(OcrReviewDraftService reviewDraftService) {
        this.reviewDraftService = reviewDraftService;
    }

    @PutMapping("/api/ocr/review-drafts/{ocrTaskId}")
    public Result<OcrReviewDraftResponse> saveDraft(
            @PathVariable String ocrTaskId,
            @RequestHeader(value = OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
            @RequestBody OcrReviewDraftUpdateRequest request
    ) {
        return Result.success(reviewDraftService.saveDraft(ocrTaskId, request, idempotencyKey));
    }
}
