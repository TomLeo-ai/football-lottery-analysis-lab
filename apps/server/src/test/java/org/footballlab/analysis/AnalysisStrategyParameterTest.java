package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;

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
class AnalysisStrategyParameterTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @Test
    void shouldReturnAndPersistEffectiveStrategyParameterSnapshot() throws Exception {
        String request = """
                {
                  "snapshotId": "snapshot-strategy-001",
                  "sourceType": "USER_SCREENSHOT_CONFIRMED",
                  "analysisAllowed": true,
                  "riskPreference": "BALANCED",
                  "budgetAmount": 20,
                  "currency": "CNY",
                  "engineMode": "MOCK_RULE_ENGINE",
                  "strategyParameters": {
                    "budgetAmount": 30,
                    "currency": "CNY",
                    "targetTicketCount": 4,
                    "minTicketCount": 3,
                    "maxTicketCount": 5,
                    "riskPreference": "AGGRESSIVE",
                    "mainTicketRatio": 0.5,
                    "defensiveTicketRatio": 0.3,
                    "entertainmentTicketRatio": 0.2,
                    "enableEntertainmentTicket": true,
                    "entertainmentTicketMaxCost": 2,
                    "maxParlayLegs": 3,
                    "preferredPlayTypes": ["WIN_DRAW_LOSS"],
                    "excludedPlayTypes": ["EXACT_SCORE"],
                    "exactScorePolicy": "DISABLED",
                    "allowLowReturnTicket": true,
                    "upsetCoverageLevel": "STRONG"
                  },
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
                .andExpect(jsonPath("$.data.engineType").value("MOCK_RULE_ENGINE"))
                .andExpect(jsonPath("$.data.strategyParameters.budgetAmount").value(30.0))
                .andExpect(jsonPath("$.data.strategyParameters.riskPreference").value("AGGRESSIVE"))
                .andExpect(jsonPath("$.data.strategyParameters.targetTicketCount").value(4))
                .andExpect(jsonPath("$.data.simulatedSelections[0].stakeAmount").value(30.0))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("模拟")))
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String reportId = extractString(body, "reportId");
        var persistedReport = analysisReportRepository.findById(reportId);
        assertThat(persistedReport).isPresent();
        assertThat(persistedReport.get().strategyParameters().budgetAmount()).isEqualByComparingTo("30.00");
    }

    @Test
    void shouldRejectExcludedPlayTypesInRuleEngineOutput() throws Exception {
        String request = """
                {
                  "snapshotId": "snapshot-strategy-002",
                  "sourceType": "USER_SCREENSHOT_CONFIRMED",
                  "analysisAllowed": true,
                  "strategyParameters": {
                    "excludedPlayTypes": ["WIN_DRAW_LOSS"]
                  },
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

        mockMvc.perform(post("/api/analysis/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isBadRequest());
    }

    private static String extractString(String json, String fieldName) {
        String marker = "\"" + fieldName + "\":\"";
        int start = json.indexOf(marker);
        assertThat(start).isGreaterThanOrEqualTo(0);
        int valueStart = start + marker.length();
        int valueEnd = json.indexOf('"', valueStart);
        assertThat(valueEnd).isGreaterThan(valueStart);
        return json.substring(valueStart, valueEnd);
    }
}
