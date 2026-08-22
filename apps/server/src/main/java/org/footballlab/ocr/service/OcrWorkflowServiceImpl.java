package org.footballlab.ocr.service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import org.footballlab.ocr.repository.OcrWorkflowRepository;
import org.footballlab.ocr.domain.LocalOcrParseRequest;
import org.footballlab.ocr.domain.OcrExtractedFieldResponse;
import org.footballlab.ocr.domain.OcrTaskResponse;
import org.footballlab.ocr.domain.ScreenshotTaskCreateRequest;
import org.footballlab.ocr.domain.ScreenshotTaskResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OcrWorkflowServiceImpl implements OcrWorkflowService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final String SAMPLE_LABEL = "DEMO DATA / FICTIONAL SAMPLE";
    private static final String WAITING_LOCAL_OCR = "WAITING_LOCAL_OCR";
    private static final String WAITING_USER_CONFIRMATION = "WAITING_USER_CONFIRMATION";
    private static final String USER_SCREENSHOT_CONFIRMED = "USER_SCREENSHOT_CONFIRMED";
    private static final String CONFIRMED = "CONFIRMED";
    private static final String PRIVACY_POLICY = "截图仅用于用户本地 OCR 与人工确认；OCR 结果不作为公共官方数据源。";

    private final OcrWorkflowRepository ocrWorkflowRepository;
    private final AtomicLong screenshotSequence;
    private final AtomicLong ocrSequence;

    public OcrWorkflowServiceImpl(OcrWorkflowRepository ocrWorkflowRepository) {
        this.ocrWorkflowRepository = ocrWorkflowRepository;
        this.screenshotSequence = new AtomicLong(ocrWorkflowRepository.nextScreenshotSequence());
        this.ocrSequence = new AtomicLong(ocrWorkflowRepository.nextOcrSequence());
    }

    @Override
    public ScreenshotTaskResponse createScreenshotTask(ScreenshotTaskCreateRequest request) {
        String taskId = "shot-%06d".formatted(screenshotSequence.getAndIncrement());
        ScreenshotTaskResponse response = new ScreenshotTaskResponse(
                taskId,
                request.fileName(),
                request.contentType(),
                request.fileSize(),
                normalizeSampleLabel(request.sampleLabel()),
                WAITING_LOCAL_OCR,
                false,
                PRIVACY_POLICY,
                now());
        ocrWorkflowRepository.saveScreenshotTask(response);
        return response;
    }

    @Override
    public OcrTaskResponse parseLocalOcrResult(LocalOcrParseRequest request) {
        if (!ocrWorkflowRepository.existsScreenshotTask(request.screenshotTaskId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Screenshot task does not exist.");
        }

        String ocrTaskId = "ocr-%06d".formatted(ocrSequence.getAndIncrement());
        List<OcrExtractedFieldResponse> fields = request.fields().stream()
                .map(field -> new OcrExtractedFieldResponse(
                        field.fieldName(),
                        field.fieldValue(),
                        field.confidence(),
                        field.sourceRegion()))
                .toList();

        OcrTaskResponse response = new OcrTaskResponse(
                ocrTaskId,
                request.screenshotTaskId(),
                request.ocrProvider(),
                request.rawText(),
                WAITING_USER_CONFIRMATION,
                false,
                fields,
                now());
        ocrWorkflowRepository.saveOcrTask(response);
        return response;
    }

    private String normalizeSampleLabel(String sampleLabel) {
        if (sampleLabel == null || sampleLabel.isBlank()) {
            return SAMPLE_LABEL;
        }
        return sampleLabel;
    }

    private String now() {
        return OffsetDateTime.now(DEFAULT_ZONE).toString();
    }
}
