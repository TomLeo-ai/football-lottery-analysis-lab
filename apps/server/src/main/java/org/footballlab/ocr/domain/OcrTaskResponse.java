package org.footballlab.ocr.domain;

import java.util.List;

public record OcrTaskResponse(
        String ocrTaskId,
        String screenshotTaskId,
        String ocrProvider,
        String rawText,
        String status,
        boolean analysisAllowed,
        List<OcrExtractedFieldResponse> fields,
        String parsedAt) {
}

