package org.footballlab.ocr.controller;

import org.footballlab.common.Result;
import org.footballlab.ocr.domain.LocalOcrParseRequest;
import org.footballlab.ocr.domain.OcrReviewConfirmRequest;
import org.footballlab.ocr.domain.OcrTaskResponse;
import org.footballlab.ocr.domain.ScreenshotTaskCreateRequest;
import org.footballlab.ocr.domain.ScreenshotTaskResponse;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.footballlab.ocr.service.OcrWorkflowService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OcrWorkflowController {

    private final OcrWorkflowService ocrWorkflowService;

    public OcrWorkflowController(OcrWorkflowService ocrWorkflowService) {
        this.ocrWorkflowService = ocrWorkflowService;
    }

    @PostMapping("/api/screenshots/tasks")
    public Result<ScreenshotTaskResponse> createScreenshotTask(@RequestBody ScreenshotTaskCreateRequest request) {
        return Result.success(ocrWorkflowService.createScreenshotTask(request));
    }

    @PostMapping("/api/ocr/parse-local-result")
    public Result<OcrTaskResponse> parseLocalOcrResult(@RequestBody LocalOcrParseRequest request) {
        return Result.success(ocrWorkflowService.parseLocalOcrResult(request));
    }

    @PostMapping("/api/ocr/review/confirm")
    public Result<UserConfirmedSnapshotResponse> confirmReview(@RequestBody OcrReviewConfirmRequest request) {
        return Result.success(ocrWorkflowService.confirmReview(request));
    }
}

