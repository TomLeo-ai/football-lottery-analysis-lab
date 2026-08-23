package org.footballlab.ocr.service;

import org.footballlab.ocr.domain.OcrReviewDraftResponse;
import org.footballlab.ocr.domain.OcrReviewDraftUpdateRequest;

public interface OcrReviewDraftService {

    OcrReviewDraftResponse getDraft(String ocrTaskId);

    OcrReviewDraftResponse saveDraft(String ocrTaskId, OcrReviewDraftUpdateRequest request, String idempotencyKey);
}
