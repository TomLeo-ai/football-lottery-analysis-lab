package org.footballlab.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.llm.domain.LlmHttpResponse;
import org.footballlab.llm.service.LlmHttpTransport;
import org.junit.jupiter.api.Test;
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

    @MockBean
    private LlmHttpTransport llmHttpTransport;

    @Test
    void shouldPersistPredictionAuditWithHashesAndReturnAuditId() throws Exception {
        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(200, llmResponseBody(validPredictionOutput(), 101, 202, 303), 88));

        MvcResult result = mockMvc.perform(post("/api/analysis/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(openAiCompatibleAnalysisRequest()))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode response = readData(result);
        String auditId = response.path("llmAuditId").asText();
        assertThat(auditId).isNotBlank();

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "select * from llm_invocation_audit where audit_id = ?",
                auditId);
        assertThat(row.get("business_type")).isEqualTo("ANALYSIS_PREDICTION");
        assertThat(row.get("business_id")).isEqualTo(response.path("reportId").asText());
        assertThat(row.get("provider_key")).isEqualTo("openai");
        assertThat(row.get("model_id")).isEqualTo("gpt-4o-mini");
        assertThat(row.get("prompt_version")).isEqualTo("danche-prediction-v1");
        assertThat(row.get("input_hash")).asString().hasSize(64);
        assertThat(row.get("output_hash")).asString().hasSize(64);
        assertThat(((Number) row.get("prompt_tokens")).intValue()).isEqualTo(101);
        assertThat(((Number) row.get("completion_tokens")).intValue()).isEqualTo(202);
        assertThat(((Number) row.get("total_tokens")).intValue()).isEqualTo(303);
        assertThat(((Number) row.get("latency_ms")).longValue()).isEqualTo(88);
        assertThat(row.get("safety_status")).isEqualTo("PASSED");
        assertThat(row.get("error_code")).isNull();
        assertAuditRowDoesNotContainRawSensitiveContent(row);
    }

    @Test
    void shouldPersistDeepSeekPredictionAuditWhenOutputIsMarkdownWrappedJson() throws Exception {
        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(
                        200,
                        llmResponseBody(markdownWrappedJson(validPredictionOutput()), 111, 222, 333),
                        91));

        MvcResult result = mockMvc.perform(post("/api/analysis/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(deepSeekCompatibleAnalysisRequest()))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode response = readData(result);
        String auditId = response.path("llmAuditId").asText();
        assertThat(auditId).isNotBlank();
        assertThat(response.path("providerKey").asText()).isEqualTo("deepseek");
        assertThat(response.path("modelId").asText()).isEqualTo("deepseek-v4-pro");
        assertThat(response.path("promptVersion").asText()).isEqualTo("danche-prediction-v1");
        assertThat(response.path("safetyStatus").asText()).isEqualTo("PASSED");

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "select * from llm_invocation_audit where audit_id = ?",
                auditId);
        assertThat(row.get("business_type")).isEqualTo("ANALYSIS_PREDICTION");
        assertThat(row.get("business_id")).isEqualTo(response.path("reportId").asText());
        assertThat(row.get("provider_key")).isEqualTo("deepseek");
        assertThat(row.get("model_id")).isEqualTo("deepseek-v4-pro");
        assertThat(row.get("prompt_version")).isEqualTo("danche-prediction-v1");
        assertThat(row.get("input_hash")).asString().hasSize(64);
        assertThat(row.get("output_hash")).asString().hasSize(64);
        assertThat(((Number) row.get("prompt_tokens")).intValue()).isEqualTo(111);
        assertThat(((Number) row.get("completion_tokens")).intValue()).isEqualTo(222);
        assertThat(((Number) row.get("total_tokens")).intValue()).isEqualTo(333);
        assertThat(((Number) row.get("latency_ms")).longValue()).isEqualTo(91);
        assertThat(row.get("safety_status")).isEqualTo("PASSED");
        assertThat(row.get("error_code")).isNull();
        assertAuditRowDoesNotContainRawSensitiveContent(row);
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

    private static String openAiCompatibleAnalysisRequest() {
        return """
                {
                  "snapshotId": "snapshot-llm-audit-001",
                  "sourceType": "USER_SCREENSHOT_CONFIRMED",
                  "analysisAllowed": true,
                  "engineMode": "OPENAI_COMPATIBLE",
                  "providerKey": "openai",
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
                """;
    }

    private static String deepSeekCompatibleAnalysisRequest() {
        return openAiCompatibleAnalysisRequest()
                .replace("\"providerKey\": \"openai\"", "\"providerKey\": \"deepseek\"")
                .replace("\"modelId\": \"gpt-4o-mini\"", "\"modelId\": \"deepseek-v4-pro\"");
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
