package org.footballlab.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.llm.domain.LlmHttpRequest;
import org.footballlab.llm.domain.LlmHttpResponse;
import org.footballlab.llm.service.LlmHttpTransport;
import org.footballlab.review.repository.ReviewRecordRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
        "OPENAI_API_KEY=unit-test-secret",
        "DEEPSEEK_API_KEY=unit-test-secret"
})
@AutoConfigureMockMvc
class ReviewWorkflowControllerTest {

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
    private ReviewRecordRepository reviewRecordRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private LlmHttpTransport llmHttpTransport;

    @Test
    void shouldMatchSettleAndReviewPendingSimulatedPlanWithMockPublicResult() throws Exception {
        String planId = createSavedPlan();

        mockMvc.perform(post("/api/result-providers/sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerKey": "mock-public-results",
                                  "requestedBy": "stage-7-test"
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/reviews/pending"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].planId").value(planId))
                .andExpect(jsonPath("$.data[0].planStatus").value("PENDING_RESULT"));

        mockMvc.perform(post("/api/simulated-plans/{planId}/match-result", planId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planId").value(planId))
                .andExpect(jsonPath("$.data.matchStatus").value("MATCHED"))
                .andExpect(jsonPath("$.data.matchConfidence").value(0.98))
                .andExpect(jsonPath("$.data.candidates[0].sourceName").value("Mock Public Result Provider"))
                .andExpect(jsonPath("$.data.candidates[0].sourceUrl").value("https://example.com/mock-public-results"))
                .andExpect(jsonPath("$.data.candidates[0].sourceLicense").value("Fictional sample for local tests only"));

        MvcResult settleResult = mockMvc.perform(post("/api/simulated-plans/{planId}/settle", planId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planId").value(planId))
                .andExpect(jsonPath("$.data.reviewStatus").value("MISS"))
                .andExpect(jsonPath("$.data.matchStatus").value("MATCHED"))
                .andExpect(jsonPath("$.data.matchConfidence").value(0.98))
                .andExpect(jsonPath("$.data.reviewEngineType").value("RULE_REVIEW_ONLY"))
                .andExpect(jsonPath("$.data.itemSettlements[0].settlementStatus").value("MISS"))
                .andExpect(jsonPath("$.data.failureReasons", contains("DIRECTION_ERROR")))
                .andExpect(jsonPath("$.data.strategyRevisionRules[0].reasonCode").value("DIRECTION_ERROR"))
                .andExpect(jsonPath("$.data.resultSource.sourceName").value("Mock Public Result Provider"))
                .andExpect(jsonPath("$.data.resultSource.sourceLicense").value("Fictional sample for local tests only"))
                .andExpect(jsonPath("$.data.supportedSettlementStatuses", hasItem("HIT")))
                .andExpect(jsonPath("$.data.supportedSettlementStatuses", hasItem("MISS")))
                .andExpect(jsonPath("$.data.supportedSettlementStatuses", hasItem("PARTIAL_HIT")))
                .andExpect(jsonPath("$.data.supportedSettlementStatuses", hasItem("VOID")))
                .andExpect(jsonPath("$.data.supportedSettlementStatuses", hasItem("PENDING")))
                .andExpect(jsonPath("$.data.supportedSettlementStatuses", hasItem("NEEDS_REVIEW")))
                .andExpect(jsonPath("$.data.supportedFailureReasons", hasItem("MATCH_POSTPONED_OR_CANCELLED")))
                .andReturn();

        mockMvc.perform(get("/api/simulated-plans/{planId}/review", planId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planId").value(planId))
                .andExpect(jsonPath("$.data.reviewStatus").value("MISS"))
                .andExpect(jsonPath("$.data.failureReasons[0]").value("DIRECTION_ERROR"));

        assertThat(reviewRecordRepository.findByPlanId(planId))
                .isPresent()
                .get()
                .extracting(reviewRecord -> reviewRecord.reviewStatus())
                .isEqualTo("MISS");

        String body = settleResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        for (String term : BLOCKED_OUTPUT_TERMS) {
            assertThat(body).doesNotContain(term);
        }
        verifyNoInteractions(llmHttpTransport);
    }

    @Test
    void shouldAttachLlmReviewInsightWithoutChangingRuleSettlement() throws Exception {
        String planId = createSavedPlan();

        mockMvc.perform(post("/api/result-providers/sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerKey": "mock-public-results",
                                  "requestedBy": "stage-4-llm-review-test"
                                }
                                """))
                .andExpect(status().isOk());

        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(200, llmResponseBody(validReviewInsightOutput()), 73));

        MvcResult settleResult = mockMvc.perform(post("/api/simulated-plans/{planId}/settle", planId)
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
                .andExpect(jsonPath("$.data.planId").value(planId))
                .andExpect(jsonPath("$.data.reviewStatus").value("MISS"))
                .andExpect(jsonPath("$.data.itemSettlements[0].settlementStatus").value("MISS"))
                .andExpect(jsonPath("$.data.reviewEngineType").value("RULE_REVIEW_WITH_LLM_INSIGHT"))
                .andExpect(jsonPath("$.data.providerKey").value("openai"))
                .andExpect(jsonPath("$.data.modelId").value("gpt-4o-mini"))
                .andExpect(jsonPath("$.data.promptVersion").value("danche-review-insight-v1"))
                .andExpect(jsonPath("$.data.safetyStatus").value("PASSED"))
                .andExpect(jsonPath("$.data.llmInsight.settlementAuthorityNotice").exists())
                .andExpect(jsonPath("$.data.llmInsight.failureClassifications[0].reasonCode").value("DIRECTION_ERROR"))
                .andReturn();

        assertThat(reviewRecordRepository.findByPlanId(planId))
                .isPresent()
                .get()
                .satisfies(reviewRecord -> {
                    assertThat(reviewRecord.reviewStatus()).isEqualTo("MISS");
                    assertThat(reviewRecord.itemSettlements().get(0).settlementStatus()).isEqualTo("MISS");
                    assertThat(reviewRecord.reviewEngineType()).isEqualTo("RULE_REVIEW_WITH_LLM_INSIGHT");
                    assertThat(reviewRecord.llmInsight().path("settlementAuthorityNotice").asText()).contains("规则引擎");
                });

        ArgumentCaptor<LlmHttpRequest> requestCaptor = ArgumentCaptor.forClass(LlmHttpRequest.class);
        verify(llmHttpTransport).exchange(requestCaptor.capture());
        assertThat(requestCaptor.getValue().authorizationHeader()).isEqualTo("Bearer unit-test-secret");
        assertThat(requestCaptor.getValue().body())
                .contains("danche-review-insight-v1")
                .contains("ruleSettlementLocked")
                .contains("DIRECTION_ERROR")
                .contains(planId);
        assertThat(requestCaptor.getValue().toString()).doesNotContain("unit-test-secret");

        String body = settleResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        for (String term : BLOCKED_OUTPUT_TERMS) {
            assertThat(body).doesNotContain(term);
        }
    }

    @Test
    void shouldAttachDeepSeekMarkdownReviewInsightWithoutChangingRuleSettlement() throws Exception {
        String planId = createSavedPlan();

        mockMvc.perform(post("/api/result-providers/sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerKey": "mock-public-results",
                                  "requestedBy": "stage-d-deepseek-review-test"
                                }
                                """))
                .andExpect(status().isOk());

        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(200, llmResponseBody(markdownWrappedJson(validReviewInsightOutput())), 73));

        MvcResult settleResult = mockMvc.perform(post("/api/simulated-plans/{planId}/settle", planId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "reviewEngineMode": "RULE_REVIEW_WITH_LLM_INSIGHT",
                                  "providerKey": "deepseek",
                                  "modelId": "deepseek-v4-pro",
                                  "promptVersion": "danche-review-insight-v1"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planId").value(planId))
                .andExpect(jsonPath("$.data.reviewStatus").value("MISS"))
                .andExpect(jsonPath("$.data.itemSettlements[0].settlementStatus").value("MISS"))
                .andExpect(jsonPath("$.data.reviewEngineType").value("RULE_REVIEW_WITH_LLM_INSIGHT"))
                .andExpect(jsonPath("$.data.providerKey").value("deepseek"))
                .andExpect(jsonPath("$.data.modelId").value("deepseek-v4-pro"))
                .andExpect(jsonPath("$.data.promptVersion").value("danche-review-insight-v1"))
                .andExpect(jsonPath("$.data.safetyStatus").value("PASSED"))
                .andExpect(jsonPath("$.data.llmAuditId").isNotEmpty())
                .andExpect(jsonPath("$.data.llmInsight.settlementAuthorityNotice").exists())
                .andExpect(jsonPath("$.data.llmInsight.failureClassifications[0].reasonCode").value("DIRECTION_ERROR"))
                .andReturn();

        assertThat(reviewRecordRepository.findByPlanId(planId))
                .isPresent()
                .get()
                .satisfies(reviewRecord -> {
                    assertThat(reviewRecord.reviewStatus()).isEqualTo("MISS");
                    assertThat(reviewRecord.itemSettlements().get(0).settlementStatus()).isEqualTo("MISS");
                    assertThat(reviewRecord.providerKey()).isEqualTo("deepseek");
                    assertThat(reviewRecord.modelId()).isEqualTo("deepseek-v4-pro");
                    assertThat(reviewRecord.llmAuditId()).isNotBlank();
                    assertThat(reviewRecord.llmInsight().path("settlementAuthorityNotice").asText()).contains("规则引擎");
                });

        ArgumentCaptor<LlmHttpRequest> requestCaptor = ArgumentCaptor.forClass(LlmHttpRequest.class);
        verify(llmHttpTransport).exchange(requestCaptor.capture());
        assertThat(requestCaptor.getValue().url()).isEqualTo("https://api.deepseek.com/chat/completions");
        assertThat(requestCaptor.getValue().authorizationHeader()).isEqualTo("Bearer unit-test-secret");
        assertThat(requestCaptor.getValue().body())
                .contains("danche-review-insight-v1")
                .contains("ruleSettlementLocked")
                .contains("DIRECTION_ERROR")
                .contains("\"model\":\"deepseek-v4-pro\"")
                .contains(planId);
        assertThat(requestCaptor.getValue().toString()).doesNotContain("unit-test-secret");

        String body = settleResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        for (String term : BLOCKED_OUTPUT_TERMS) {
            assertThat(body).doesNotContain(term);
        }
    }

    private String createSavedPlan() throws Exception {
        MvcResult simulateResult = mockMvc.perform(post("/api/strategies/simulate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "reportId": "analysis-review-001",
                                  "snapshotId": "snapshot-review-001",
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
                                      "rationale": "用于阶段 7 复盘测试的虚构分析。"
                                    }
                                  ],
                                  "simulatedSelections": [
                                    {
                                      "matchId": "demo-match-001",
                                      "playType": "WIN_DRAW_LOSS",
                                      "selection": "AWAY_WIN",
                                      "odds": 2.05,
                                      "stakeAmount": 10,
                                      "note": "模拟选择，用于复盘测试。"
                                    }
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();

        String generatedPlanId = JsonPath.read(
                simulateResult.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "$.data.planId");

        MvcResult saveResult = mockMvc.perform(post("/api/simulated-plans")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "generatedPlanId": "%s",
                                  "operatorNote": "保存为阶段 7 复盘测试方案。"
                                }
                                """.formatted(generatedPlanId)))
                .andExpect(status().isOk())
                .andReturn();

        return JsonPath.read(
                saveResult.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "$.data.planId");
    }

    private String llmResponseBody(String content) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "choices", new Object[] {
                        Map.of("message", Map.of("content", content))
                },
                "usage", Map.of(
                        "prompt_tokens", 121,
                        "completion_tokens", 144,
                        "total_tokens", 265)));
    }

    private static String markdownWrappedJson(String json) {
        return """
                ```json
                %s
                ```
                """.formatted(json);
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
}
