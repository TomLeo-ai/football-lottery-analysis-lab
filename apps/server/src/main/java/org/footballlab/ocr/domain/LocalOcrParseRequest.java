package org.footballlab.ocr.domain;

import java.util.List;

public record LocalOcrParseRequest(
        String screenshotTaskId,
        String ocrProvider,
        String rawText,
        List<OcrExtractedFieldRequest> fields) {
}

