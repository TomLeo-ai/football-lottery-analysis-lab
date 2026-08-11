package org.footballlab.ocr.domain;

public record OcrExtractedFieldRequest(
        String fieldName,
        String fieldValue,
        double confidence,
        String sourceRegion) {
}

