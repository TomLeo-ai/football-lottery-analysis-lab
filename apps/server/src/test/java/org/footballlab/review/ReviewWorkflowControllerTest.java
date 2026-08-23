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
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.RiskWarningResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.analysis.persistence.AnalysisReportV2Record;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.llm.domain.LlmHttpRequest;
import org.footballlab.llm.domain.LlmHttpResponse;
import org.footballlab.llm.service.LlmHttpTransport;
import org.footballlab.review.repository.ReviewRecordRepository;
import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;
import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSnapshotResponse;
import org.footballlab.plan.repository.SimulatedPlanRepository;
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
        "spring.datasource.url=jdbc:h2:mem:review_workflow_controller_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
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

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @Autowired
    private SimulatedPlanRepository simulatedPlanRepository;

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

    @Test
    void corruptedV2NonWdlPlanFailsBeforeReviewPersistence() throws Exception {
        String planId = createSavedPlan();
        String unsupportedPlayType = "HANDICAP_WIN_DRAW_LOSS";
        ObjectNode itemPayload = (ObjectNode) objectMapper.readTree(jdbcTemplate.queryForObject(
                "select payload_json from simulated_plan_item where plan_id = ?",
                String.class,
                planId));
        itemPayload.put("playType", unsupportedPlayType);
        jdbcTemplate.update("""
                        update simulated_plan_item
                        set play_type = ?, payload_json = ?
                        where plan_id = ?
                        """,
                unsupportedPlayType,
                objectMapper.writeValueAsString(itemPayload),
                planId);

        ObjectNode planPayload = (ObjectNode) objectMapper.readTree(jdbcTemplate.queryForObject(
                "select payload_json from simulated_plan where plan_id = ?",
                String.class,
                planId));
        ((ObjectNode) planPayload.path("items").get(0)).put("playType", unsupportedPlayType);
        jdbcTemplate.update(
                "update simulated_plan set payload_json = ? where plan_id = ?",
                objectMapper.writeValueAsString(planPayload),
                planId);

        mockMvc.perform(post("/api/simulated-plans/{planId}/settle", planId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("PLAN_LINEAGE_INTEGRITY_FAILED"));

        assertThat(reviewRecordRepository.existsByPlanId(planId)).isFalse();
    }

    @Test
    void legacyHandicapPlanKeepsNeedsReviewSettlementWithoutChangingPlanStatus() throws Exception {
        String planId = insertLegacyPendingHandicapPlan();
        mockMvc.perform(post("/api/result-providers/sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"providerKey":"mock-public-results","requestedBy":"legacy-review-test"}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/simulated-plans/{planId}/settle", planId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reviewStatus").value("NEEDS_REVIEW"))
                .andExpect(jsonPath("$.data.itemSettlements[0].settlementStatus").value("NEEDS_REVIEW"))
                .andExpect(jsonPath("$.data.itemSettlements[0].failureReason").value("PLAY_TYPE_ERROR"));

        assertThat(jdbcTemplate.queryForObject(
                "select plan_status from simulated_plan where plan_id = ?", String.class, planId))
                .isEqualTo("PENDING_RESULT");
    }

    private String createSavedPlan() throws Exception {
        String reportId = insertAuthoritativeReportFixture();
        MvcResult simulateResult = mockMvc.perform(post("/api/strategies/simulate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "reportId": "%s"
                                }
                                """.formatted(reportId)))
                .andExpect(status().isCreated())
                .andReturn();

        String generatedPlanId = JsonPath.read(
                simulateResult.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "$.data.planId");

        MvcResult saveResult = mockMvc.perform(post("/api/simulated-plans")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
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

    private String insertLegacyPendingHandicapPlan() {
        String suffix = UUID.randomUUID().toString();
        String planId = "legacy-review-plan-" + suffix;
        StrategyParameterRequest strategy = new StrategyParameterRequest(
                new BigDecimal("20.00"), "CNY", 1, 1, 1, "BALANCED",
                new BigDecimal("0.60"), new BigDecimal("0.30"), new BigDecimal("0.10"), true,
                new BigDecimal("2.00"), 1,
                List.of("WIN_DRAW_LOSS", "HANDICAP_WIN_DRAW_LOSS"), List.of(), "DISABLED",
                null, false, "BALANCED");
        SimulatedPlanItemResponse item = new SimulatedPlanItemResponse(
                "legacy-review-item-" + suffix,
                "demo-match-001",
                "2026-07-01",
                "Fictional Coastal League",
                "Northport United",
                "Lakeside City",
                "2026-07-01T19:30:00+08:00",
                "HANDICAP_WIN_DRAW_LOSS",
                "AWAY_WIN",
                new BigDecimal("2.0500"),
                new BigDecimal("10.00"),
                "GENERATED",
                "Legacy handicap fixture.");
        SimulatedPlanSnapshotResponse generatedSnapshot = new SimulatedPlanSnapshotResponse(
                "legacy-plan-snapshot-" + suffix,
                "legacy-snapshot-" + suffix,
                "legacy-report-" + suffix,
                "USER_SCREENSHOT_CONFIRMED",
                "MOCK_RULE_ENGINE",
                "GENERATED",
                strategy,
                1,
                "GENERATED",
                "2026-08-24T10:00:00+08:00");
        SimulatedPlanResponse generated = new SimulatedPlanResponse(
                planId, "SIMULATED_ONLY", "GENERATED", generatedSnapshot.reportId(),
                generatedSnapshot.snapshotId(), "CNY", new BigDecimal("20.00"), strategy,
                List.of("GENERATED"), List.of(item), generatedSnapshot, "Legacy research plan.", null,
                "2026-08-24T10:00:00+08:00", "2026-08-24T10:00:00+08:00");
        simulatedPlanRepository.savePlan(generated);
        SimulatedPlanResponse pending = new SimulatedPlanResponse(
                planId, generated.planType(), "PENDING_RESULT", generated.reportId(), generated.snapshotId(),
                generated.currency(), generated.budgetAmount(), strategy,
                List.of("GENERATED", "SAVED", "PENDING_RESULT"), List.of(item),
                new SimulatedPlanSnapshotResponse(
                        generatedSnapshot.planSnapshotId(), generatedSnapshot.snapshotId(),
                        generatedSnapshot.reportId(), generatedSnapshot.inputSourceType(),
                        generatedSnapshot.engineType(), generatedSnapshot.sourceReportStatus(), strategy, 1,
                        "PENDING_RESULT", generatedSnapshot.capturedAt()),
                generated.complianceNotice(), "Legacy saved.", generated.createdAt(),
                "2026-08-24T10:01:00+08:00");
        simulatedPlanRepository.savePlan(pending);
        return planId;
    }

    private String insertAuthoritativeReportFixture() throws Exception {
        String suffix = UUID.randomUUID().toString();
        String workflowId = "workflow-review-" + suffix;
        String screenshotId = "shot-review-" + suffix;
        String ocrId = "ocr-review-" + suffix;
        String snapshotId = "snapshot-review-" + suffix;
        String reportId = "analysis-review-" + suffix;
        String now = "2026-08-24T10:00:00+08:00";
        List<ConfirmedMatchResponse> matches = List.of(new ConfirmedMatchResponse(
                "demo-match-001", "2026-07-01", "Fictional Coastal League",
                "Northport United", "Lakeside City", "2026-07-01T19:30:00+08:00"));
        List<ConfirmedMarketResponse> markets = List.of(new ConfirmedMarketResponse(
                "market-review-" + suffix, "demo-match-001", "WIN_DRAW_LOSS", "AWAY_WIN",
                new BigDecimal("2.0500")));
        jdbcTemplate.update("insert into ocr_workflow (workflow_id,current_stage,version,current_ocr_task_id,confirmed_snapshot_id,current_report_id,created_at,updated_at) values (?,'ANALYSIS_GENERATED',4,?,?,?,?,?)",
                workflowId, ocrId, snapshotId, reportId, now, now);
        jdbcTemplate.update("insert into screenshot_task (task_id,file_name,content_type,file_size,sample_label,status,server_ocr_enabled,privacy_policy,created_at,workflow_id) values (?,'review.png','image/png',1,'FICTIONAL_SAMPLE','CREATED',false,'LOCAL_ONLY',?,?)",
                screenshotId, now, workflowId);
        jdbcTemplate.update("insert into ocr_task (ocr_task_id,screenshot_task_id,ocr_provider,status,analysis_allowed,parsed_at,workflow_id) values (?,?,'LOCAL_BROWSER','PARSED',true,?,?)",
                ocrId, screenshotId, now, workflowId);
        jdbcTemplate.update("insert into ocr_confirmed_snapshot (snapshot_id,ocr_task_id,source_type,snapshot_status,analysis_allowed,risk_preference,budget_amount,currency,matches_json,markets_json,payload_json,confirmed_at,workflow_id,confirmed_revision,authority_type,provenance_json,schema_version) values (?,?,'USER_SCREENSHOT_CONFIRMED','CONFIRMED',true,'BALANCED',20.00,'CNY',?,?,'{}',?,?,7,'SERVER_CONFIRMED_V2','{}','CONFIRMED_SNAPSHOT_V2')",
                snapshotId, ocrId, objectMapper.writeValueAsString(matches), objectMapper.writeValueAsString(markets), now, workflowId);
        StrategyParameterRequest strategy = new StrategyParameterRequest(
                new BigDecimal("20.00"), "CNY", 1, 1, 1, "BALANCED",
                new BigDecimal("0.60"), new BigDecimal("0.30"), new BigDecimal("0.10"), true,
                new BigDecimal("2.00"), 1, List.of("WIN_DRAW_LOSS"), List.of(), "DISABLED",
                null, false, "BALANCED");
        analysisReportRepository.insertV2(new AnalysisReportV2Record(
                workflowId, reportId, snapshotId, 7, AnalysisReportV2Record.AUTHORITY_TYPE,
                "USER_SCREENSHOT_CONFIRMED", "MOCK_RULE_ENGINE", "GENERATED", strategy,
                "STRATEGY_DEFAULTS_V2", List.of(new ProbabilityInsightResponse(
                        "demo-match-001", "2026-07-01", "Fictional Coastal League",
                        "2026-07-01T19:30:00+08:00", "Northport United", "Lakeside City",
                        "AWAY_WIN", "MEDIUM", "Persisted review fixture.")),
                List.of(new RiskWarningResponse("INFO_RISK", "MEDIUM", "Review fixture risk.")),
                List.of(new SimulatedSelectionResponse(
                        "demo-match-001", "WIN_DRAW_LOSS", "AWAY_WIN", new BigDecimal("2.0500"),
                        new BigDecimal("10.00"), "Persisted review selection.")),
                "For research only.", now, null, null, null, "PASSED", null, null));
        return reportId;
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
