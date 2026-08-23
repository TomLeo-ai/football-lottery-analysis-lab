package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.AnalysisMarketRequest;
import org.footballlab.analysis.domain.AnalysisMatchRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ResolvedAnalysisEngineConfiguration;
import org.footballlab.analysis.service.AnalysisEngineContext;
import org.footballlab.analysis.service.AnalysisEngineResult;
import org.footballlab.analysis.service.AuthoritativeAnalysisInput;
import org.footballlab.analysis.service.MockRuleAnalysisEngine;
import org.footballlab.analysis.service.OpenAiCompatibleAnalysisEngine;
import org.footballlab.llm.domain.LlmHttpRequest;
import org.footballlab.llm.domain.LlmHttpResponse;
import org.footballlab.llm.service.LlmHttpTransport;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:analysis_engine_tests;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "OPENAI_API_KEY=unit-test-secret"
})
@AutoConfigureMockMvc
class AnalysisEngineTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private OpenAiCompatibleAnalysisEngine openAiCompatibleAnalysisEngine;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private LlmHttpTransport llmHttpTransport;

    @Test
    void mockRuleEngineReturnsWrappedReport() {
        MockRuleAnalysisEngine engine = new MockRuleAnalysisEngine();
        StrategyParameterRequest strategyParameters = strategyParameters();

        AnalysisEngineResult result = engine.generate(new AnalysisEngineContext(
                "analysis-engine-001",
                "2026-08-23T15:01:00+08:00",
                authoritativeInput(),
                new ResolvedAnalysisEngineConfiguration("MOCK_RULE_ENGINE", null, null, null),
                strategyParameters));

        assertThat(result.report().reportId()).isEqualTo("analysis-engine-001");
        assertThat(result.report().snapshotId()).isEqualTo("snapshot-engine-001");
        assertThat(result.report().strategyParameters()).isEqualTo(strategyParameters);
        assertThat(result.report().simulatedSelections()).singleElement()
                .satisfies(selection -> {
                    assertThat(selection.matchId()).isEqualTo("match-engine-001");
                    assertThat(selection.selection()).isEqualTo("HOME_WIN");
                });
    }

    @Test
    void openAiCompatibleEngineReturnsWrappedValidatedReportAndAuditMetadata() throws Exception {
        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(200, llmResponseBody(validLlmOutput()), 88));
        AnalysisEngineContext context = openAiContext("openai");

        AnalysisReportResponse report = openAiCompatibleAnalysisEngine.generate(context).report();

        assertThat(report.engineType()).isEqualTo("OPENAI_COMPATIBLE");
        assertThat(report.providerKey()).isEqualTo("openai");
        assertThat(report.modelId()).isEqualTo("gpt-4o-mini");
        assertThat(report.promptVersion()).isEqualTo("danche-prediction-v1");
        assertThat(report.safetyStatus()).isEqualTo("PASSED");
        assertThat(report.llmOutput().path("parameterUsage").path("budgetAmount").decimalValue())
                .isEqualByComparingTo("20");
        assertThat(report.simulatedSelections()).singleElement()
                .extracting(selection -> selection.matchId())
                .isEqualTo("match-engine-001");
        assertThat(report.llmAuditId()).isNotBlank();
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from llm_invocation_audit where business_id = ?",
                Integer.class,
                context.reportId())).isEqualTo(1);

        ArgumentCaptor<LlmHttpRequest> requestCaptor = ArgumentCaptor.forClass(LlmHttpRequest.class);
        verify(llmHttpTransport).exchange(requestCaptor.capture());
        assertThat(requestCaptor.getValue().url()).isEqualTo("https://api.openai.com/v1/chat/completions");
        assertThat(requestCaptor.getValue().authorizationHeader()).isEqualTo("Bearer unit-test-secret");
        assertThat(requestCaptor.getValue().body())
                .contains("snapshot-engine-001")
                .contains("danche-prediction-v1")
                .contains("\"model\":\"gpt-4o-mini\"");
        assertThat(requestCaptor.getValue().toString()).doesNotContain("unit-test-secret");
    }

    @Test
    void openAiCompatibleEngineRejectsMissingProviderCredentialBeforeTransport() {
        assertThatThrownBy(() -> openAiCompatibleAnalysisEngine.generate(openAiContext("deepseek")))
                .isInstanceOf(ResponseStatusException.class);

        verifyNoInteractions(llmHttpTransport);
    }

    @Test
    void task4ServiceRejectsExternalEngineBeforeTransportInvocation() throws Exception {
        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "snapshotId": "snapshot-engine-missing",
                                  "engineMode": "OPENAI_COMPATIBLE",
                                  "providerKey": "openai",
                                  "modelId": "gpt-4o-mini",
                                  "promptVersion": "danche-prediction-v1",
                                  "analysisOptions": null
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("UNSUPPORTED_ANALYSIS_ENGINE"));

        verifyNoInteractions(llmHttpTransport);
    }

    private AnalysisEngineContext openAiContext(String providerKey) {
        return new AnalysisEngineContext(
                "analysis-engine-" + UUID.randomUUID(),
                "2026-08-23T15:01:00+08:00",
                authoritativeInput(),
                new ResolvedAnalysisEngineConfiguration(
                        "OPENAI_COMPATIBLE",
                        providerKey,
                        "gpt-4o-mini",
                        "danche-prediction-v1"),
                strategyParameters());
    }

    private AuthoritativeAnalysisInput authoritativeInput() {
        return new AuthoritativeAnalysisInput(
                "workflow-engine-001",
                "snapshot-engine-001",
                "SERVER_CONFIRMED_V2",
                "USER_SCREENSHOT_CONFIRMED",
                "CONFIRMED",
                true,
                new BigDecimal("20.00"),
                "CNY",
                "BALANCED",
                "2026-08-23T15:00:00+08:00",
                List.of(new AnalysisMatchRequest(
                        "match-engine-001",
                        "2026-08-24",
                        "Engine League",
                        "Engine North",
                        "Engine South",
                        "2026-08-24T19:30:00+08:00")),
                List.of(new AnalysisMarketRequest(
                        "market-engine-001",
                        "match-engine-001",
                        "WIN_DRAW_LOSS",
                        "HOME_WIN",
                        new BigDecimal("2.0500"))));
    }

    private StrategyParameterRequest strategyParameters() {
        return new StrategyParameterRequest(
                new BigDecimal("20.00"),
                "CNY",
                1,
                1,
                2,
                "BALANCED",
                new BigDecimal("0.60"),
                new BigDecimal("0.30"),
                new BigDecimal("0.10"),
                true,
                new BigDecimal("2.00"),
                2,
                List.of("WIN_DRAW_LOSS"),
                List.of("EXACT_SCORE"),
                "DISABLED",
                null,
                false,
                "BALANCED");
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
                      "matchId": "match-engine-001",
                      "mainScore": "2:1"
                    }
                  ],
                  "upsetFocus": [],
                  "stableMatches": [
                    {
                      "matchId": "match-engine-001"
                    }
                  ],
                  "ticketGroups": [
                    {
                      "ticketType": "MAIN",
                      "cost": 20,
                      "legs": ["match-engine-001"],
                      "selections": [
                        {
                          "matchId": "match-engine-001",
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
}
