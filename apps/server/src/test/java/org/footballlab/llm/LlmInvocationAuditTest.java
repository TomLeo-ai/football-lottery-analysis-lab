package org.footballlab.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.AnalysisMarketRequest;
import org.footballlab.analysis.domain.AnalysisMatchRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ResolvedAnalysisEngineConfiguration;
import org.footballlab.analysis.service.AnalysisEngineContext;
import org.footballlab.analysis.service.AnalysisEngineResult;
import org.footballlab.analysis.service.AuthoritativeAnalysisInput;
import org.footballlab.analysis.service.OpenAiCompatibleAnalysisEngine;
import org.footballlab.llm.domain.LlmHttpRequest;
import org.footballlab.llm.domain.LlmHttpResponse;
import org.footballlab.llm.domain.LlmInvocationAuditRecord;
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
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
        "OPENAI_API_KEY=unit-test-secret",
        "DEEPSEEK_API_KEY=unit-test-secret"
})
@AutoConfigureMockMvc
class LlmInvocationAuditTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private OpenAiCompatibleAnalysisEngine openAiCompatibleAnalysisEngine;

    @MockBean
    private LlmHttpTransport llmHttpTransport;

    @Test
    void shouldBuildPredictionAuditWithoutPersistingIt() throws Exception {
        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(200, llmResponseBody(validPredictionOutput(), 101, 202, 303), 88));
        AnalysisEngineContext context = predictionContext("openai", "gpt-4o-mini");

        AnalysisEngineResult result = openAiCompatibleAnalysisEngine.generate(context);
        AnalysisReportResponse response = result.report();
        LlmInvocationAuditRecord audit = result.successAudit();
        String auditId = response.llmAuditId();
        assertThat(auditId).isNotBlank();
        assertThat(audit.auditId()).isEqualTo(auditId);
        assertThat(audit.businessType()).isEqualTo("ANALYSIS_PREDICTION");
        assertThat(audit.businessId()).isEqualTo(response.reportId());
        assertThat(audit.providerKey()).isEqualTo("openai");
        assertThat(audit.modelId()).isEqualTo("gpt-4o-mini");
        assertThat(audit.promptVersion()).isEqualTo("danche-prediction-v1");
        assertThat(audit.inputHash()).hasSize(64);
        assertThat(audit.outputHash()).hasSize(64);
        assertThat(audit.promptTokens()).isEqualTo(101);
        assertThat(audit.completionTokens()).isEqualTo(202);
        assertThat(audit.totalTokens()).isEqualTo(303);
        assertThat(audit.latencyMs()).isEqualTo(88);
        assertThat(audit.safetyStatus()).isEqualTo("PASSED");
        assertThat(audit.errorCode()).isNull();
        assertThat(audit.toString()).doesNotContain("unit-test-secret").doesNotContain("ticketGroups");
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from llm_invocation_audit where audit_id = ?",
                Integer.class,
                auditId)).isZero();
        assertPredictionTransport(
                "https://api.openai.com/v1/chat/completions",
                "gpt-4o-mini");
    }

    @Test
    void shouldBuildDeepSeekPredictionAuditForMarkdownWrappedJsonWithoutSaving() throws Exception {
        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(
                        200,
                        llmResponseBody(markdownWrappedJson(validPredictionOutput()), 111, 222, 333),
                        91));
        AnalysisEngineContext context = predictionContext("deepseek", "deepseek-v4-pro");

        AnalysisEngineResult result = openAiCompatibleAnalysisEngine.generate(context);
        AnalysisReportResponse response = result.report();
        LlmInvocationAuditRecord audit = result.successAudit();
        String auditId = response.llmAuditId();
        assertThat(auditId).isNotBlank();
        assertThat(response.providerKey()).isEqualTo("deepseek");
        assertThat(response.modelId()).isEqualTo("deepseek-v4-pro");
        assertThat(response.promptVersion()).isEqualTo("danche-prediction-v1");
        assertThat(response.safetyStatus()).isEqualTo("PASSED");

        assertThat(audit.auditId()).isEqualTo(auditId);
        assertThat(audit.businessType()).isEqualTo("ANALYSIS_PREDICTION");
        assertThat(audit.businessId()).isEqualTo(response.reportId());
        assertThat(audit.providerKey()).isEqualTo("deepseek");
        assertThat(audit.modelId()).isEqualTo("deepseek-v4-pro");
        assertThat(audit.promptVersion()).isEqualTo("danche-prediction-v1");
        assertThat(audit.inputHash()).hasSize(64);
        assertThat(audit.outputHash()).hasSize(64);
        assertThat(audit.promptTokens()).isEqualTo(111);
        assertThat(audit.completionTokens()).isEqualTo(222);
        assertThat(audit.totalTokens()).isEqualTo(333);
        assertThat(audit.latencyMs()).isEqualTo(91);
        assertThat(audit.safetyStatus()).isEqualTo("PASSED");
        assertThat(audit.errorCode()).isNull();
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from llm_invocation_audit where audit_id = ?",
                Integer.class,
                auditId)).isZero();
        assertPredictionTransport(
                "https://api.deepseek.com/chat/completions",
                "deepseek-v4-pro");
    }

    @Test
    void shouldPersistReviewInsightAuditAndReturnAuditId() throws Exception {
        String planId = createSavedPlan();
        mockMvc.perform(post("/api/result-providers/sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerKey": "mock-public-results",
                                  "requestedBy": "audit-test"
                                }
                                """))
                .andExpect(status().isOk());

        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(200, llmResponseBody(validReviewInsightOutput(), 121, 144, 265), 73));

        MvcResult result = mockMvc.perform(post("/api/simulated-plans/{planId}/settle", planId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "reviewEngineMode": "RULE_REVIEW_WITH_LLM_INSIGHT",
                                  "providerKey": "openai",
                                  "modelId": "gpt-4o-mini",
                                  "promptVersion": "danche-review-insight-v1"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode response = readData(result);
        String auditId = response.path("llmAuditId").asText();
        assertThat(auditId).isNotBlank();

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "select * from llm_invocation_audit where audit_id = ?",
                auditId);
        assertThat(row.get("business_type")).isEqualTo("REVIEW_INSIGHT");
        assertThat(row.get("business_id")).isEqualTo(planId);
        assertThat(row.get("provider_key")).isEqualTo("openai");
        assertThat(row.get("model_id")).isEqualTo("gpt-4o-mini");
        assertThat(row.get("prompt_version")).isEqualTo("danche-review-insight-v1");
        assertThat(row.get("input_hash")).asString().hasSize(64);
        assertThat(row.get("output_hash")).asString().hasSize(64);
        assertThat(((Number) row.get("prompt_tokens")).intValue()).isEqualTo(121);
        assertThat(((Number) row.get("completion_tokens")).intValue()).isEqualTo(144);
        assertThat(((Number) row.get("total_tokens")).intValue()).isEqualTo(265);
        assertThat(((Number) row.get("latency_ms")).longValue()).isEqualTo(73);
        assertThat(row.get("safety_status")).isEqualTo("PASSED");
        assertThat(row.get("error_code")).isNull();
        assertAuditRowDoesNotContainRawSensitiveContent(row);
    }

    @Test
    void shouldPersistBlockedDeepSeekReviewInsightAuditWhenModelTriesToRewriteSettlement() throws Exception {
        String planId = createSavedPlan();
        mockMvc.perform(post("/api/result-providers/sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerKey": "mock-public-results",
                                  "requestedBy": "blocked-review-audit-test"
                                }
                                """))
                .andExpect(status().isOk());

        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(
                        200,
                        llmResponseBody(markdownWrappedJson(reviewInsightOutputThatTriesToRewriteSettlement()), 131, 155, 286),
                        81));

        MvcResult result = mockMvc.perform(post("/api/simulated-plans/{planId}/settle", planId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "reviewEngineMode": "RULE_REVIEW_WITH_LLM_INSIGHT",
                                  "providerKey": "deepseek",
                                  "modelId": "deepseek-v4-pro",
                                  "promptVersion": "danche-review-insight-v1"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andReturn();

        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain("unit-test-secret")
                .doesNotContain("FORCED_HIT")
                .doesNotContain("settlementAuthorityNotice");

        Map<String, Object> row = jdbcTemplate.queryForMap(
                """
                        select * from llm_invocation_audit
                        where business_type = ? and business_id = ?
                        order by created_at desc
                        limit 1
                        """,
                "REVIEW_INSIGHT",
                planId);
        assertThat(row.get("provider_key")).isEqualTo("deepseek");
        assertThat(row.get("model_id")).isEqualTo("deepseek-v4-pro");
        assertThat(row.get("prompt_version")).isEqualTo("danche-review-insight-v1");
        assertThat(row.get("input_hash")).asString().hasSize(64);
        assertThat(row.get("output_hash")).asString().hasSize(64);
        assertThat(((Number) row.get("prompt_tokens")).intValue()).isEqualTo(131);
        assertThat(((Number) row.get("completion_tokens")).intValue()).isEqualTo(155);
        assertThat(((Number) row.get("total_tokens")).intValue()).isEqualTo(286);
        assertThat(((Number) row.get("latency_ms")).longValue()).isEqualTo(81);
        assertThat(row.get("safety_status")).isEqualTo("BLOCKED");
        assertThat(row.get("error_code")).isEqualTo("REVIEW_SETTLEMENT_MUTATION_FIELD:reviewStatus");
        assertAuditRowDoesNotContainRawSensitiveContent(row);
    }

    private AnalysisEngineContext predictionContext(String providerKey, String modelId) {
        return new AnalysisEngineContext(
                "analysis-llm-audit-" + UUID.randomUUID(),
                "2026-08-23T17:00:00+08:00",
                predictionInput(),
                new ResolvedAnalysisEngineConfiguration(
                        "OPENAI_COMPATIBLE",
                        providerKey,
                        modelId,
                        "danche-prediction-v1"),
                predictionStrategyParameters());
    }

    private AuthoritativeAnalysisInput predictionInput() {
        return new AuthoritativeAnalysisInput(
                "workflow-llm-audit-001",
                "snapshot-llm-audit-001",
                "SERVER_CONFIRMED_V2",
                "USER_SCREENSHOT_CONFIRMED",
                "CONFIRMED",
                true,
                new BigDecimal("20.00"),
                "CNY",
                "BALANCED",
                "2026-08-23T16:59:00+08:00",
                List.of(new AnalysisMatchRequest(
                        "demo-match-001",
                        "2026-07-01",
                        "Fictional Coastal League",
                        "Northport United",
                        "Lakeside City",
                        "2026-07-01T19:30:00+08:00")),
                List.of(new AnalysisMarketRequest(
                        "demo-market-001",
                        "demo-match-001",
                        "WIN_DRAW_LOSS",
                        "HOME_WIN",
                        new BigDecimal("2.0500"))));
    }

    private StrategyParameterRequest predictionStrategyParameters() {
        return new StrategyParameterRequest(
                new BigDecimal("20.00"),
                "CNY",
                1,
                1,
                2,
                "BALANCED",
                new BigDecimal("0.6"),
                new BigDecimal("0.3"),
                new BigDecimal("0.1"),
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

    private void assertPredictionTransport(String expectedUrl, String expectedModel) {
        ArgumentCaptor<LlmHttpRequest> requestCaptor = ArgumentCaptor.forClass(LlmHttpRequest.class);
        verify(llmHttpTransport).exchange(requestCaptor.capture());
        LlmHttpRequest request = requestCaptor.getValue();
        assertThat(request.url()).isEqualTo(expectedUrl);
        assertThat(request.authorizationHeader()).isEqualTo("Bearer unit-test-secret");
        assertThat(request.body())
                .contains("snapshot-llm-audit-001")
                .contains("\"model\":\"" + expectedModel + "\"")
                .doesNotContain("unit-test-secret");
        assertThat(request.toString()).doesNotContain("unit-test-secret");
    }

    private void assertAuditRowDoesNotContainRawSensitiveContent(Map<String, Object> row) {
        String serializedRow = row.toString();
        assertThat(serializedRow)
                .doesNotContain("unit-test-secret")
                .doesNotContain("Bearer")
                .doesNotContain("snapshot-llm-audit-001")
                .doesNotContain("ticketGroups")
                .doesNotContain("settlementAuthorityNotice");
    }

    private JsonNode readData(MvcResult result) throws Exception {
        JsonNode root = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        return root.path("data");
    }

    private String llmResponseBody(
            String content,
            int promptTokens,
            int completionTokens,
            int totalTokens) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "choices", new Object[] {
                        Map.of("message", Map.of("content", content))
                },
                "usage", Map.of(
                        "prompt_tokens", promptTokens,
                        "completion_tokens", completionTokens,
                        "total_tokens", totalTokens)));
    }

    private String createSavedPlan() throws Exception {
        MvcResult simulateResult = mockMvc.perform(post("/api/strategies/simulate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "reportId": "analysis-review-audit-001",
                                  "snapshotId": "snapshot-review-audit-001",
                                  "inputSourceType": "USER_SCREENSHOT_CONFIRMED",
                                  "engineType": "MOCK_RULE_ENGINE",
                                  "reportStatus": "GENERATED",
                                  "currency": "CNY",
                                  "budgetAmount": 20,
                                  "probabilityAnalysis": [
                                    {
                                      "matchId": "demo-match-001",
                                      "matchDate": "2026-07-01",
                                      "league": "Fictional Coastal League",
                                      "homeTeam": "Northport United",
                                      "awayTeam": "Lakeside City",
                                      "kickoffTime": "2026-07-01T19:30:00+08:00",
                                      "selection": "AWAY_WIN",
                                      "probabilityBand": "MEDIUM",
                                      "rationale": "用于阶段 5 审计测试的虚构分析。"
                                    }
                                  ],
                                  "simulatedSelections": [
                                    {
                                      "matchId": "demo-match-001",
                                      "playType": "WIN_DRAW_LOSS",
                                      "selection": "AWAY_WIN",
                                      "odds": 2.05,
                                      "stakeAmount": 10,
                                      "note": "模拟选择，用于审计测试。"
                                    }
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();

        String generatedPlanId = readData(simulateResult).path("planId").asText();
        MvcResult saveResult = mockMvc.perform(post("/api/simulated-plans")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "generatedPlanId": "%s",
                                  "operatorNote": "保存为阶段 5 审计测试方案。"
                                }
                                """.formatted(generatedPlanId)))
                .andExpect(status().isOk())
                .andReturn();
        return readData(saveResult).path("planId").asText();
    }

    private static String markdownWrappedJson(String json) {
        return """
                ```json
                %s
                ```
                """.formatted(json);
    }

    private static String validPredictionOutput() {
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
                    "summary": "validated structured llm audit result"
                  },
                  "ledgerSnapshot": {
                    "ticketCount": 1
                  },
                  "complianceNotice": "非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议，不承诺命中率、收益或确定性结果。"
                }
                """;
    }

    private static String validReviewInsightOutput() {
        return """
                {
                  "settlementAuthorityNotice": "规则引擎已完成结算并锁定状态，大模型只做解释和策略归纳。",
                  "ticketReviewNarratives": [
                    {
                      "planItemId": "sim-item-000001",
                      "narrative": "赛果方向与保存方案方向不一致，按规则结算为 MISS。"
                    }
                  ],
                  "failureClassifications": [
                    {
                      "reasonCode": "DIRECTION_ERROR",
                      "category": "方向错",
                      "explanation": "保存方案方向与实际赛果方向不一致。"
                    }
                  ],
                  "strategyRevisionSuggestions": [
                    {
                      "ruleCode": "REVIEW_DIRECTION_WEIGHT",
                      "suggestion": "降低单一方向依赖，保留防守项。"
                    }
                  ],
                  "nextRoundParameterSuggestions": {
                    "riskPreference": "BALANCED",
                    "note": "保持预算参数，由用户手动评估是否调整。"
                  },
                  "doNotOverreactEvents": [
                    "不要因单场方向错误直接放弃整套规则。"
                  ],
                  "complianceNotice": "非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议，不承诺命中率、收益或确定性结果。"
                }
                """;
    }

    private static String reviewInsightOutputThatTriesToRewriteSettlement() {
        return validReviewInsightOutput()
                .replace(
                        "\"settlementAuthorityNotice\": \"规则引擎已完成结算并锁定状态，大模型只做解释和策略归纳。\"",
                        "\"settlementAuthorityNotice\": \"规则引擎已完成结算并锁定状态，大模型只做解释和策略归纳.\",\n"
                                + "                  \"reviewStatus\": \"FORCED_HIT\"");
    }
}
