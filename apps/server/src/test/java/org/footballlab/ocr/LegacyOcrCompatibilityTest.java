package org.footballlab.ocr;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;
import org.footballlab.ocr.domain.OcrTaskResponse;
import org.footballlab.ocr.domain.ScreenshotTaskResponse;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.footballlab.ocr.repository.OcrWorkflowRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:legacy_ocr_compatibility_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class LegacyOcrCompatibilityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private OcrWorkflowRepository repository;

    @BeforeEach
    void setUp() {
        TestDatabaseCleaner.clean(jdbcTemplate);
    }

    @Test
    void readsLegacySnapshotAsLegacyV1WithoutPromotion() throws Exception {
        String suffix = UUID.randomUUID().toString();
        String screenshotId = "shot-legacy-" + suffix;
        String ocrTaskId = "ocr-legacy-" + suffix;
        String snapshotId = "snapshot-legacy-" + suffix;

        repository.saveScreenshotTask(new ScreenshotTaskResponse(
                screenshotId,
                "legacy-demo.png",
                "image/png",
                204800L,
                "DEMO DATA / FICTIONAL SAMPLE",
                "WAITING_LOCAL_OCR",
                false,
                "截图仅用于用户本地 OCR 与人工确认；OCR 结果不作为公共官方数据源。",
                "2026-08-22T10:00:00+08:00"));
        repository.saveOcrTask(new OcrTaskResponse(
                ocrTaskId,
                screenshotId,
                "BROWSER_LOCAL_MOCK",
                "legacy raw text",
                "WAITING_USER_CONFIRMATION",
                false,
                List.of(),
                "2026-08-22T10:01:00+08:00"));
        repository.saveConfirmedSnapshot(new UserConfirmedSnapshotResponse(
                snapshotId,
                ocrTaskId,
                "USER_SCREENSHOT_CONFIRMED",
                "CONFIRMED",
                true,
                "BALANCED",
                BigDecimal.valueOf(20),
                "CNY",
                List.of(new ConfirmedMatchResponse(
                        "legacy-match-001",
                        "2026-08-22",
                        "Fictional League",
                        "Northport United",
                        "Lakeside City",
                        "2026-08-22T12:00:00Z")),
                List.of(new ConfirmedMarketResponse(
                        "legacy-market-001",
                        "legacy-match-001",
                        "WIN_DRAW_LOSS",
                        "HOME_WIN",
                        BigDecimal.valueOf(2.05))),
                "2026-08-22T10:02:00+08:00"));

        mockMvc.perform(get("/api/ocr/snapshots/{snapshotId}", snapshotId)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.snapshotId").value(snapshotId))
                .andExpect(jsonPath("$.data.schemaVersion").value("LEGACY_V1"))
                .andExpect(jsonPath("$.data.workflowId").isEmpty());
    }
}
