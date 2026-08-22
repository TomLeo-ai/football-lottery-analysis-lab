package org.footballlab.ocr;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;
import org.footballlab.ocr.domain.OcrExtractedFieldResponse;
import org.footballlab.ocr.domain.OcrTaskResponse;
import org.footballlab.ocr.domain.ScreenshotTaskResponse;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.footballlab.ocr.repository.JdbcOcrWorkflowRepository;
import org.footballlab.ocr.repository.OcrWorkflowRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class OcrWorkflowRepositoryTest {

    @Autowired
    private OcrWorkflowRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldPersistOcrWorkflowRecordsAndReadThemWithANewRepositoryInstance() {
        String suffix = UUID.randomUUID().toString();
        String taskId = "shot-repo-" + suffix;
        String ocrTaskId = "ocr-repo-" + suffix;
        String snapshotId = "snapshot-repo-" + suffix;

        ScreenshotTaskResponse screenshotTask = new ScreenshotTaskResponse(
                taskId,
                "fictional-repository-test.png",
                "image/png",
                204800L,
                "DEMO DATA / FICTIONAL SAMPLE",
                "WAITING_LOCAL_OCR",
                false,
                "截图仅用于用户本地 OCR 与人工确认；OCR 结果不作为公共官方数据源。",
                "2026-06-26T10:00:00+08:00");
        OcrTaskResponse ocrTask = new OcrTaskResponse(
                ocrTaskId,
                taskId,
                "BROWSER_LOCAL_MOCK",
                "DEMO DATA / FICTIONAL SAMPLE\nFictional Coastal League",
                "WAITING_USER_CONFIRMATION",
                false,
                List.of(new OcrExtractedFieldResponse(
                        "league",
                        "Fictional Coastal League",
                        0.96,
                        "x=12,y=20,w=180,h=32")),
                "2026-06-26T10:01:00+08:00");
        UserConfirmedSnapshotResponse confirmedSnapshot = new UserConfirmedSnapshotResponse(
                snapshotId,
                ocrTaskId,
                "USER_SCREENSHOT_CONFIRMED",
                "CONFIRMED",
                true,
                "BALANCED",
                new BigDecimal("20.00"),
                "CNY",
                List.of(new ConfirmedMatchResponse(
                        "demo-match-001",
                        "2026-07-01",
                        "Fictional Coastal League",
                        "Northport United",
                        "Lakeside City",
                        "2026-07-01T19:30:00+08:00")),
                List.of(new ConfirmedMarketResponse(
                        "demo-market-001",
                        "demo-match-001",
                        "WIN_DRAW_LOSS",
                        "HOME_WIN",
                        BigDecimal.valueOf(2.05))),
                "2026-06-26T10:02:00+08:00");

        repository.saveScreenshotTask(screenshotTask);
        repository.saveOcrTask(ocrTask);
        repository.saveConfirmedSnapshot(confirmedSnapshot);

        OcrWorkflowRepository reloadedRepository = new JdbcOcrWorkflowRepository(jdbcTemplate, objectMapper);

        assertThat(reloadedRepository.existsScreenshotTask(taskId)).isTrue();
        assertThat(reloadedRepository.existsOcrTask(ocrTaskId)).isTrue();
        assertThat(reloadedRepository.findScreenshotTask(taskId)).contains(screenshotTask);
        assertThat(reloadedRepository.findOcrTask(ocrTaskId)).contains(ocrTask);
        assertThat(reloadedRepository.findConfirmedSnapshot(snapshotId)).contains(confirmedSnapshot);
    }
}
