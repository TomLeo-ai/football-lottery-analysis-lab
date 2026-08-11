package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class AnalysisControllerTest {

    private static final List<String> BLOCKED_OUTPUT_TERMS = List.of(
            "\u5fc5\u4e2d",
            "\u7a33\u8d5a",
            "\u5305\u4e2d",
            "\u56de\u672c",
            "\u8ddf\u6295",
            "\u5b9e\u5355\u63a8\u8350",
            "\u52a0\u6ce8");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @Test
    void shouldGenerateMockAnalysisOnlyFromUserConfirmedSnapshot() throws Exception {
        String request = """
                {
                  "snapshotId": "snapshot-demo-001",
                  "sourceType": "USER_SCREENSHOT_CONFIRMED",
                  "analysisAllowed": true,
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
                """;

        MvcResult result = mockMvc.perform(post("/api/analysis/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reportId").exists())
                .andExpect(jsonPath("$.data.snapshotId").value("snapshot-demo-001"))
                .andExpect(jsonPath("$.data.inputSourceType").value("USER_SCREENSHOT_CONFIRMED"))
                .andExpect(jsonPath("$.data.engineType").value("MOCK_RULE_ENGINE"))
                .andExpect(jsonPath("$.data.reportStatus").value("GENERATED"))
                .andExpect(jsonPath("$.data.probabilityAnalysis[0].matchId").value("demo-match-001"))
                .andExpect(jsonPath("$.data.riskWarnings[0].riskCode").value("INFO_RISK"))
                .andExpect(jsonPath("$.data.simulatedSelections[0].selection").value("HOME_WIN"))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("非官方")))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("仅模拟分析")))
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String reportId = JsonFieldExtractor.extractString(body, "reportId");
        assertThat(analysisReportRepository.findById(reportId))
                .isPresent()
                .get()
                .extracting(report -> report.reportStatus())
                .isEqualTo("GENERATED");
        for (String term : BLOCKED_OUTPUT_TERMS) {
            assertThat(body).doesNotContain(term);
        }
    }

    @Test
    void shouldRejectUnconfirmedSnapshotForAnalysis() throws Exception {
        String request = """
                {
                  "snapshotId": "ocr-demo-001",
                  "sourceType": "WAITING_USER_CONFIRMATION",
                  "analysisAllowed": false,
                  "riskPreference": "BALANCED",
                  "budgetAmount": 20,
                  "currency": "CNY",
                  "matches": [],
                  "markets": []
                }
                """;

        mockMvc.perform(post("/api/analysis/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isBadRequest());
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
