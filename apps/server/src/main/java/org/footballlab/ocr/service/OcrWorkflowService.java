package org.footballlab.ocr.service;

import org.footballlab.ocr.domain.LocalOcrParseRequest;
import org.footballlab.ocr.domain.OcrTaskResponse;
import org.footballlab.ocr.domain.ScreenshotTaskCreateRequest;
import org.footballlab.ocr.domain.ScreenshotTaskResponse;

public interface OcrWorkflowService {

    ScreenshotTaskResponse createScreenshotTask(ScreenshotTaskCreateRequest request);

    OcrTaskResponse parseLocalOcrResult(LocalOcrParseRequest request);
}

