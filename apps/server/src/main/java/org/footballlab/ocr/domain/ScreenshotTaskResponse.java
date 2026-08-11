package org.footballlab.ocr.domain;

public record ScreenshotTaskResponse(
        String taskId,
        String fileName,
        String contentType,
        long fileSize,
        String sampleLabel,
        String status,
        boolean serverOcrEnabled,
        String privacyPolicy,
        String createdAt) {
}

