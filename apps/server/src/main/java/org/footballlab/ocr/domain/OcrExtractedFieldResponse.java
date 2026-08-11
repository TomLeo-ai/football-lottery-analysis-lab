package org.footballlab.ocr.domain;

public record OcrExtractedFieldResponse(
        String fieldName,
        String fieldValue,
        double confidence,
        String sourceRegion) {
}

