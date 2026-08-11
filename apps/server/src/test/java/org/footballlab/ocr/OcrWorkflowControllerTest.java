package org.footballlab.ocr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;

import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.footballlab.ocr.repository.OcrWorkflowRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class OcrWorkflowControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private OcrWorkflowRepository ocrWorkflowRepository;

    @Test
    void shouldCreateScreenshotTaskParseLocalOcrAndConfirmUserSnapshot() throws Exception {
        String screenshotRequest = """
                {
                  "fileName": "fictional-demo-slip.png",
                  "contentType": "image/png",
                  "fileSize": 204800,
                  "sampleLabel": "DEMO DATA / FICTIONAL SAMPLE"
                }
                """;

        MvcResult screenshotResult = mockMvc.perform(post("/api/screenshots/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(screenshotRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("WAITING_LOCAL_OCR"))
                .andExpect(jsonPath("$.data.serverOcrEnabled").value(false))
                .andExpect(jsonPath("$.data.privacyPolicy", containsString("不作为公共官方数据源")))
                .andReturn();

        String screenshotBody = screenshotResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(screenshotBody).contains("DEMO DATA / FICTIONAL SAMPLE");
        String screenshotTaskId = JsonFieldExtractor.extractString(screenshotBody, "taskId");

        String parseRequest = """
                {
                  "screenshotTaskId": "%s",
                  "ocrProvider": "BROWSER_LOCAL_MOCK",
                  "rawText": "DEMO DATA / FICTIONAL SAMPLE\\nFictional Coastal League\\nNorthport United vs Lakeside City",
                  "fields": [
                    {
                      "fieldName": "league",
                      "fieldValue": "Fictional Coastal League",
                      "confidence": 0.96,
                      "sourceRegion": "x=12,y=20,w=180,h=32"
                    },
                    {
                      "fieldName": "homeTeam",
                      "fieldValue": "Northport United",
                      "confidence": 0.94,
                      "sourceRegion": "x=12,y=64,w=180,h=32"
                    }
                  ]
                }
                """.formatted(screenshotTaskId);

        MvcResult parseResult = mockMvc.perform(post("/api/ocr/parse-local-result")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(parseRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("WAITING_USER_CONFIRMATION"))
                .andExpect(jsonPath("$.data.analysisAllowed").value(false))
                .andExpect(jsonPath("$.data.fields[0].fieldName").value("league"))
                .andReturn();

        String parseBody = parseResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String ocrTaskId = JsonFieldExtractor.extractString(parseBody, "ocrTaskId");

        String confirmRequest = """
                {
                  "ocrTaskId": "%s",
                  "riskPreference": "BALANCED",
                  "budgetAmount": 20,
                  "currency": "CNY",
                  "matches": [
                    {
                      "matchId": "demo-match-001",
                      "matchDate": "2026-07-01",
                      "league": "Fictional Coastal League",
                      "homeTeam": "Northport United",
                      "awayTeam": "Lakeside City",
                      "kickoffTime": "2026-07-01T19:30:00+08:00"
                    }
                  ],
                  "markets": [
                    {
                      "marketId": "demo-market-001",
                      "matchId": "demo-match-001",
                      "playType": "WIN_DRAW_LOSS",
                      "selection": "HOME_WIN",
                      "odds": 2.05
                    }
                  ]
                }
                """.formatted(ocrTaskId);

        MvcResult confirmResult = mockMvc.perform(post("/api/ocr/review/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(confirmRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sourceType").value("USER_SCREENSHOT_CONFIRMED"))
                .andExpect(jsonPath("$.data.snapshotStatus").value("CONFIRMED"))
                .andExpect(jsonPath("$.data.analysisAllowed").value(true))
                .andExpect(jsonPath("$.data.matches[0].homeTeam").value("Northport United"))
                .andExpect(jsonPath("$.data.markets[0].odds").value(2.05))
                .andReturn();

        String confirmBody = confirmResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String snapshotId = JsonFieldExtractor.extractString(confirmBody, "snapshotId");

        assertThat(ocrWorkflowRepository.findScreenshotTask(screenshotTaskId)).isPresent();
        assertThat(ocrWorkflowRepository.findOcrTask(ocrTaskId)).isPresent();
        assertThat(ocrWorkflowRepository.findConfirmedSnapshot(snapshotId))
                .isPresent()
                .get()
                .extracting(UserConfirmedSnapshotResponse::sourceType)
                .isEqualTo("USER_SCREENSHOT_CONFIRMED");
    }

    private static final class JsonFieldExtractor {

        private JsonFieldExtractor() {
        }

        static String extractString(String json, String fieldName) {
            String marker = "\"" + fieldName + "\":\"";
            int start = json.indexOf(marker);
            assertThat(start).isGreaterThanOrEqualTo(0);
            int valueStart = start + marker.length();
            int valueEnd = json.indexOf('"', valueStart);
            assertThat(valueEnd).isGreaterThan(valueStart);
            return json.substring(valueStart, valueEnd);
        }
    }
}
