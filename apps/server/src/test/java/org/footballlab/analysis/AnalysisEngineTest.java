package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.llm.domain.LlmHttpRequest;
import org.footballlab.llm.domain.LlmHttpResponse;
import org.footballlab.llm.service.LlmHttpTransport;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = "OPENAI_API_KEY=unit-test-secret")
@AutoConfigureMockMvc
class AnalysisEngineTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private LlmHttpTransport llmHttpTransport;

    @Test
    void shouldRouteExplicitOpenAiCompatibleAnalysisThroughLlmEngineAndPersistMetadata() throws Exception {
        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(200, llmResponseBody(validLlmOutput()), 88));

        MvcResult result = mockMvc.perform(post("/api/analysis/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(openAiCompatibleRequest("openai")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.engineType").value("OPENAI_COMPATIBLE"))
                .andExpect(jsonPath("$.data.providerKey").value("openai"))
                .andExpect(jsonPath("$.data.modelId").value("gpt-4o-mini"))
                .andExpect(jsonPath("$.data.promptVersion").value("danche-prediction-v1"))
                .andExpect(jsonPath("$.data.safetyStatus").value("PASSED"))
                .andExpect(jsonPath("$.data.llmOutput.parameterUsage.budgetAmount").value(20))
                .andExpect(jsonPath("$.data.simulatedSelections[0].matchId").value("demo-match-001"))
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String reportId = JsonFieldExtractor.extractString(body, "reportId");
        assertThat(analysisReportRepository.findById(reportId))
                .isPresent()
                .get()
                .satisfies(report -> {
                    assertThat(report.providerKey()).isEqualTo("openai");
                    assertThat(report.modelId()).isEqualTo("gpt-4o-mini");
                    assertThat(report.promptVersion()).isEqualTo("danche-prediction-v1");
                    assertThat(report.safetyStatus()).isEqualTo("PASSED");
                    assertThat(report.llmOutput().path("finalDecision").path("summary").asText()).contains("validated");
                });

        ArgumentCaptor<LlmHttpRequest> requestCaptor = ArgumentCaptor.forClass(LlmHttpRequest.class);
        verify(llmHttpTransport).exchange(requestCaptor.capture());
        assertThat(requestCaptor.getValue().url()).isEqualTo("https://api.openai.com/v1/chat/completions");
        assertThat(requestCaptor.getValue().authorizationHeader()).isEqualTo("Bearer unit-test-secret");
        assertThat(requestCaptor.getValue().body())
                .contains("snapshot-llm-001")
                .contains("danche-prediction-v1")
                .contains("\"model\":\"gpt-4o-mini\"");
        assertThat(requestCaptor.getValue().toString()).doesNotContain("unit-test-secret");
    }

    @Test
    void shouldRejectOpenAiCompatibleAnalysisWhenProviderCredentialIsMissing() throws Exception {
        mockMvc.perform(post("/api/analysis/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(openAiCompatibleRequest("deepseek")))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(llmHttpTransport);
    }

    private String openAiCompatibleRequest(String providerKey) {
        return """
                {
                  "snapshotId": "snapshot-llm-001",
                  "sourceType": "USER_SCREENSHOT_CONFIRMED",
                  "analysisAllowed": true,
                  "engineMode": "OPENAI_COMPATIBLE",
                  "providerKey": "%s",
                  "modelId": "gpt-4o-mini",
                  "promptVersion": "danche-prediction-v1",
                  "strategyParameters": {
                    "budgetAmount": 20,
                    "currency": "CNY",
                    "targetTicketCount": 1,
                    "minTicketCount": 1,
                    "maxTicketCount": 2,
                    "riskPreference": "BALANCED",
                    "mainTicketRatio": 0.6,
                    "defensiveTicketRatio": 0.3,
                    "entertainmentTicketRatio": 0.1,
                    "enableEntertainmentTicket": true,
                    "entertainmentTicketMaxCost": 2,
                    "maxParlayLegs": 2,
                    "preferredPlayTypes": ["WIN_DRAW_LOSS"],
                    "excludedPlayTypes": ["EXACT_SCORE"],
                    "exactScorePolicy": "DISABLED",
                    "allowLowReturnTicket": false,
                    "upsetCoverageLevel": "BALANCED"
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
                """.formatted(providerKey);
    }

    private String llmResponseBody(String content) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "choices", new Object[] {
                        Map.of("message", Map.of("content", content))
                },
                "usage", Map.of(
                        "prompt_tokens", 101,
                        "completion_tokens", 202,
                        "total_tokens", 303)));
    }

    private static String validLlmOutput() {
        return """
                {
                  "parameterUsage": {
                    "budgetAmount": 20,
                    "targetTicketCount": 1,
                    "maxParlayLegs": 2
                  },
                  "scorePredictions": [
                    {
                      "matchId": "demo-match-001",
                      "mainScore": "2:1"
                    }
                  ],
                  "upsetFocus": [],
                  "stableMatches": [
                    {
                      "matchId": "demo-match-001"
                    }
                  ],
                  "ticketGroups": [
                    {
                      "ticketType": "MAIN",
                      "cost": 20,
                      "legs": ["demo-match-001"],
                      "selections": [
                        {
                          "matchId": "demo-match-001",
                          "playType": "WIN_DRAW_LOSS",
                          "selection": "HOME_WIN"
                        }
                      ]
                    }
                  ],
                  "finalDecision": {
                    "summary": "validated structured llm result"
                  },
                  "ledgerSnapshot": {
                    "ticketCount": 1
                  },
                  "complianceNotice": "非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议，不承诺命中率、收益或确定性结果。"
                }
                """;
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
