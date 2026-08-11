package org.footballlab.ocr.service;

import org.footballlab.ocr.domain.LocalOcrParseRequest;
import org.footballlab.ocr.domain.OcrReviewConfirmRequest;
import org.footballlab.ocr.domain.OcrTaskResponse;
import org.footballlab.ocr.domain.ScreenshotTaskCreateRequest;
import org.footballlab.ocr.domain.ScreenshotTaskResponse;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;

public interface OcrWorkflowService {

    ScreenshotTaskResponse createScreenshotTask(ScreenshotTaskCreateRequest request);

    OcrTaskResponse parseLocalOcrResult(LocalOcrParseRequest request);

    UserConfirmedSnapshotResponse confirmReview(OcrReviewConfirmRequest request);
}

