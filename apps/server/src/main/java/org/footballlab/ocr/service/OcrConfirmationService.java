package org.footballlab.ocr.service;

import org.footballlab.ocr.domain.OcrReviewConfirmRequest;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.springframework.http.HttpStatus;

public interface OcrConfirmationService {

    ConfirmationResult confirmDraft(String ocrTaskId, OcrReviewConfirmRequest request, String idempotencyKey);

    UserConfirmedSnapshotResponse getSnapshot(String snapshotId);

    record ConfirmationResult(HttpStatus httpStatus, UserConfirmedSnapshotResponse snapshot) {
    }
}
