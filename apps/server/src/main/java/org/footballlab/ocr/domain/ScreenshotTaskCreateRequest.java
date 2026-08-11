package org.footballlab.ocr.domain;

public record ScreenshotTaskCreateRequest(
        String fileName,
        String contentType,
        long fileSize,
        String sampleLabel) {
}

