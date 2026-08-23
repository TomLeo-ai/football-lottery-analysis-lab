package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.analysis.domain.AnalysisOptionsRequest;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.analysis.service.AnalysisEngineConfigurationResolver;
import org.footballlab.analysis.service.AnalysisService;
import org.footballlab.analysis.service.AnalysisServiceImpl;
import org.footballlab.analysis.service.AnalysisTransactionCoordinator;
import org.footballlab.analysis.service.OpenAiCompatibleAnalysisEngine;
import org.footballlab.llm.domain.LlmHttpResponse;
import org.footballlab.llm.domain.ModelProviderResponse;
import org.footballlab.llm.service.LlmHttpTransport;
import org.footballlab.llm.service.LlmProviderRegistry;
import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;
import org.footballlab.ocr.repository.OcrWorkflowRepository;
import org.footballlab.strategy.service.AnalysisOptionsResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:analysis_llm_transaction_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "OPENAI_API_KEY=api-key-sentinel-transaction-do-not-leak"
})
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class AnalysisLlmTransactionTest {

    private static final String NOW = "2026-08-23T16:00:00+08:00";
    private static final String PROMPT_SENTINEL = "prompt-sentinel-transaction-do-not-leak";
    private static final String RAW_OUTPUT_SENTINEL = "raw-selection-sentinel-transaction-do-not-leak";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AnalysisServiceImpl analysisService;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @Autowired
    private OcrWorkflowRepository ocrWorkflowRepository;

    @Autowired
    private AnalysisOptionsResolver analysisOptionsResolver;

    @Autowired
    private AnalysisEngineConfigurationResolver engineConfigurationResolver;

    @Autowired
    private org.footballlab.workflow.service.RequestHashService requestHashService;

    @Autowired
    private AnalysisTransactionCoordinator transactionCoordinator;

    @Autowired
    private OpenAiCompatibleAnalysisEngine externalEngine;

    @SpyBean
    private LlmProviderRegistry providerRegistry;

    @MockBean
    private LlmHttpTransport llmHttpTransport;

    @Test
    void onlyOneDifferentKeyClaimsWorkflowAndSuccessfulSameKeyReplayDoesNotInvokeProviderAgain() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("concurrent");
        String firstKey = UUID.randomUUID().toString();
        String competingKey = UUID.randomUUID().toString();
        CountDownLatch transportStarted = new CountDownLatch(1);
        CountDownLatch releaseTransport = new CountDownLatch(1);
        AtomicInteger invocationCount = new AtomicInteger();
        String responseBody = llmResponseBody(validLlmOutput(fixture.matchId()));

        when(llmHttpTransport.exchange(any())).thenAnswer(invocation -> {
            invocationCount.incrementAndGet();
            transportStarted.countDown();
            if (!releaseTransport.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting to release blocking provider transport.");
            }
            return new LlmHttpResponse(200, responseBody, 88);
        });

        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<MvcResult> firstRequest = executor.submit(() -> performGenerate(firstKey, fixture.snapshotId()));

            assertThat(transportStarted.await(3, TimeUnit.SECONDS))
                    .as("the first request must commit its claim before entering provider transport")
                    .isTrue();

            mockMvc.perform(post("/api/analysis/generate")
                            .header("Idempotency-Key", firstKey)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(externalRequest(fixture.snapshotId())))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.errorCode").value("OPERATION_IN_PROGRESS"));

            mockMvc.perform(post("/api/analysis/generate")
                            .header("Idempotency-Key", competingKey)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(externalRequest(fixture.snapshotId())))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.errorCode").value("OPERATION_IN_PROGRESS"));
            assertThat(invocationCount).hasValue(1);

            releaseTransport.countDown();
            MvcResult created = firstRequest.get(5, TimeUnit.SECONDS);
            assertThat(created.getResponse().getStatus()).isEqualTo(201);
            String reportId = responseData(created).path("reportId").asText();
            assertSuccessfulAtomicState(fixture.workflowId(), firstKey, reportId);

            MvcResult replay = mockMvc.perform(post("/api/analysis/generate")
                            .header("Idempotency-Key", firstKey)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(externalRequest(fixture.snapshotId())))
                    .andExpect(status().isCreated())
                    .andReturn();

            assertThat(responseData(replay).path("reportId").asText()).isEqualTo(reportId);
            assertThat(invocationCount).hasValue(1);
            assertThat(jdbcTemplate.queryForObject(
                    "select count(*) from llm_invocation_audit where business_id = ?",
                    Integer.class,
                    reportId)).isEqualTo(1);
        } finally {
            releaseTransport.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void providerFailurePersistsOneSafeFailureAuditAndReplaysWithoutAnotherInvocation() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("provider-failure");
        String idempotencyKey = UUID.randomUUID().toString();
        AtomicInteger invocationCount = new AtomicInteger();
        when(llmHttpTransport.exchange(any())).thenAnswer(invocation -> {
            invocationCount.incrementAndGet();
            return new LlmHttpResponse(502, "provider-raw-secret-output", 31);
        });

        MvcResult failed = mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(externalRequest(fixture.snapshotId())))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error.errorCode").value("LLM_PROVIDER_HTTP_ERROR"))
                .andReturn();

        String failedBody = failed.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(failedBody)
                .doesNotContain("api-key-sentinel-transaction-do-not-leak")
                .doesNotContain("provider-raw-secret-output")
                .doesNotContain("ticketGroups");
        assertThat(invocationCount).hasValue(1);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from llm_invocation_audit where business_id like 'analysis-%' and error_code = ?",
                Integer.class,
                "LLM_PROVIDER_HTTP_ERROR")).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from analysis_report where workflow_id = ?",
                Integer.class,
                fixture.workflowId())).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "select current_stage from ocr_workflow where workflow_id = ?",
                String.class,
                fixture.workflowId())).isEqualTo("CONFIRMED");
        assertThat(jdbcTemplate.queryForObject(
                "select active_operation_key from ocr_workflow where workflow_id = ?",
                String.class,
                fixture.workflowId())).isNull();
        assertThat(jdbcTemplate.queryForObject(
                "select operation_status from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo("FAILED");

        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(externalRequest(fixture.snapshotId())))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error.errorCode").value("LLM_PROVIDER_HTTP_ERROR"));
        assertThat(invocationCount).hasValue(1);
    }

    @Test
    void validationFailureDoesNotLeakApiKeyPromptOrRawOutputToResponsePersistenceOrLogs(CapturedOutput output)
            throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("leak");
        jdbcTemplate.update(
                "update ocr_confirmed_snapshot set matches_json = ? where snapshot_id = ?",
                objectMapper.writeValueAsString(List.of(new ConfirmedMatchResponse(
                        fixture.matchId(),
                        "2026-08-24",
                        "Database League",
                        PROMPT_SENTINEL,
                        "Database South",
                        "2026-08-24T19:30:00+08:00"))),
                fixture.snapshotId());
        String idempotencyKey = UUID.randomUUID().toString();
        AtomicInteger invocationCount = new AtomicInteger();
        String invalidOutput = validLlmOutput(fixture.matchId()).replace("HOME_WIN", RAW_OUTPUT_SENTINEL);
        when(llmHttpTransport.exchange(any())).thenAnswer(invocation -> {
            invocationCount.incrementAndGet();
            return new LlmHttpResponse(200, llmResponseBody(invalidOutput), 41);
        });

        MvcResult failed = mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(externalRequest(fixture.snapshotId())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("LLM_OUTPUT_VALIDATION_FAILED"))
                .andReturn();

        String responseBody = failed.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(responseBody)
                .doesNotContain("api-key-sentinel-transaction-do-not-leak")
                .doesNotContain(PROMPT_SENTINEL)
                .doesNotContain(RAW_OUTPUT_SENTINEL);
        Map<String, Object> audit = jdbcTemplate.queryForMap(
                "select * from llm_invocation_audit where error_code = ?",
                "LLM_OUTPUT_VALIDATION_FAILED");
        assertThat(audit.toString())
                .doesNotContain("api-key-sentinel-transaction-do-not-leak")
                .doesNotContain(PROMPT_SENTINEL)
                .doesNotContain(RAW_OUTPUT_SENTINEL);
        assertThat(jdbcTemplate.queryForObject(
                "select error_code from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo("LLM_OUTPUT_VALIDATION_FAILED");
        assertThat(output.getAll())
                .doesNotContain("api-key-sentinel-transaction-do-not-leak")
                .doesNotContain(PROMPT_SENTINEL)
                .doesNotContain(RAW_OUTPUT_SENTINEL);
        assertThat(invocationCount).hasValue(1);
    }

    @Test
    void explicitModelPromptAndOptionsReplayWithSameHashAfterRegistryDefaultAndServiceInstanceChange()
            throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("registry-restart");
        String idempotencyKey = UUID.randomUUID().toString();
        String explicitModel = "explicit-model-frozen-v1";
        AtomicInteger invocationCount = new AtomicInteger();
        when(llmHttpTransport.exchange(any())).thenAnswer(invocation -> {
            invocationCount.incrementAndGet();
            return new LlmHttpResponse(200, llmResponseBody(validLlmOutput(fixture.matchId())), 88);
        });
        AnalysisGenerateRequest request = new AnalysisGenerateRequest(
                fixture.snapshotId(),
                "OPENAI_COMPATIBLE",
                "openai",
                explicitModel,
                "danche-prediction-v1",
                new AnalysisOptionsRequest(
                        1,
                        1,
                        1,
                        new BigDecimal("1.00"),
                        new BigDecimal("0.00"),
                        new BigDecimal("0.00"),
                        false,
                        new BigDecimal("0.00"),
                        1,
                        null,
                        false,
                        "BALANCED"));

        assertThat(defaultModelForOpenAi(providerRegistry.listProviders())).isEqualTo("gpt-4o-mini");
        AnalysisService.AnalysisGenerationResult created = analysisService.generateAnalysis(request, idempotencyKey);
        String reportId = created.report().reportId();
        String originalHash = jdbcTemplate.queryForObject(
                "select request_sha256 from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey);

        doReturn(List.of(new ModelProviderResponse(
                "openai",
                "OpenAI changed default",
                "https://api.openai.com/v1",
                "registry-default-model-v2",
                "OPENAI_API_KEY",
                true,
                "CONFIGURED",
                "UNTESTED")))
                .when(providerRegistry).listProviders();
        assertThat(defaultModelForOpenAi(providerRegistry.listProviders()))
                .isEqualTo("registry-default-model-v2");

        AnalysisServiceImpl restartedService = new AnalysisServiceImpl(
                analysisReportRepository,
                ocrWorkflowRepository,
                analysisOptionsResolver,
                engineConfigurationResolver,
                requestHashService,
                transactionCoordinator,
                externalEngine);
        assertThat(restartedService).isNotSameAs(analysisService);
        AnalysisService.AnalysisGenerationResult replayed =
                restartedService.generateAnalysis(request, idempotencyKey);

        assertThat(replayed.report().reportId()).isEqualTo(reportId);
        assertThat(replayed.report().modelId()).isEqualTo(explicitModel);
        assertThat(replayed.report().promptVersion()).isEqualTo("danche-prediction-v1");
        assertThat(jdbcTemplate.queryForObject(
                "select request_sha256 from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo(originalHash);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from llm_invocation_audit where business_id = ?",
                Integer.class,
                reportId)).isEqualTo(1);
        assertThat(invocationCount).hasValue(1);
    }

    private String defaultModelForOpenAi(List<ModelProviderResponse> providers) {
        return providers.stream()
                .filter(provider -> "openai".equals(provider.providerKey()))
                .findFirst()
                .orElseThrow()
                .defaultModel();
    }

    @Test
    void completionCasFailureRollsBackSuccessEntitiesAndBecomesStableInterrupted() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("completion-failure");
        String idempotencyKey = UUID.randomUUID().toString();
        AtomicInteger invocationCount = new AtomicInteger();
        int auditCountBefore = jdbcTemplate.queryForObject(
                "select count(*) from llm_invocation_audit",
                Integer.class);
        when(llmHttpTransport.exchange(any())).thenAnswer(invocation -> {
            invocationCount.incrementAndGet();
            jdbcTemplate.update(
                    "update ocr_workflow set version = version + 1 where workflow_id = ?",
                    fixture.workflowId());
            return new LlmHttpResponse(200, llmResponseBody(validLlmOutput(fixture.matchId())), 88);
        });

        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(externalRequest(fixture.snapshotId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("OPERATION_INTERRUPTED"));

        assertThat(invocationCount).hasValue(1);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from llm_invocation_audit",
                Integer.class)).isEqualTo(auditCountBefore);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from analysis_report where workflow_id = ?",
                Integer.class,
                fixture.workflowId())).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "select operation_status from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo("INTERRUPTED");
        assertThat(jdbcTemplate.queryForObject(
                "select active_operation_key from ocr_workflow where workflow_id = ?",
                String.class,
                fixture.workflowId())).isNull();

        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(externalRequest(fixture.snapshotId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("OPERATION_INTERRUPTED"));
        assertThat(invocationCount).hasValue(1);
    }

    private void assertSuccessfulAtomicState(String workflowId, String idempotencyKey, String reportId) {
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from analysis_report where report_id = ?",
                Integer.class,
                reportId)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from llm_invocation_audit where business_id = ?",
                Integer.class,
                reportId)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "select current_stage from ocr_workflow where workflow_id = ?",
                String.class,
                workflowId)).isEqualTo("ANALYSIS_GENERATED");
        assertThat(jdbcTemplate.queryForObject(
                "select current_report_id from ocr_workflow where workflow_id = ?",
                String.class,
                workflowId)).isEqualTo(reportId);
        assertThat(jdbcTemplate.queryForObject(
                "select operation_status from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo("SUCCEEDED");
    }

    private MvcResult performGenerate(String idempotencyKey, String snapshotId) throws Exception {
        return mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(externalRequest(snapshotId)))
                .andReturn();
    }

    private AuthorityFixture insertConfirmedV2Fixture(String label) throws Exception {
        String suffix = label + "-" + UUID.randomUUID();
        String workflowId = "workflow-" + suffix;
        String screenshotTaskId = "shot-" + suffix;
        String ocrTaskId = "ocr-" + suffix;
        String snapshotId = "snapshot-" + suffix;
        String matchId = "match-db-" + suffix;
        String marketId = "market-db-" + suffix;
        List<ConfirmedMatchResponse> matches = List.of(new ConfirmedMatchResponse(
                matchId,
                "2026-08-24",
                "Database League",
                "Database North",
                "Database South",
                "2026-08-24T19:30:00+08:00"));
        List<ConfirmedMarketResponse> markets = List.of(new ConfirmedMarketResponse(
                marketId,
                matchId,
                "WIN_DRAW_LOSS",
                "HOME_WIN",
                new BigDecimal("2.1500")));

        jdbcTemplate.update("""
                        insert into ocr_workflow (
                            workflow_id, current_stage, version, current_ocr_task_id,
                            confirmed_snapshot_id, current_report_id, created_at, updated_at
                        ) values (?, 'CONFIRMED', 3, ?, ?, null, ?, ?)
                        """,
                workflowId, ocrTaskId, snapshotId, NOW, NOW);
        jdbcTemplate.update("""
                        insert into screenshot_task (
                            task_id, file_name, content_type, file_size, sample_label, status,
                            server_ocr_enabled, privacy_policy, created_at, workflow_id,
                            source_declaration, source_policy_version, authority_type, provenance_json, schema_version
                        ) values (?, 'authority.png', 'image/png', 1024, 'FICTIONAL_SAMPLE', 'CREATED',
                            false, 'LOCAL_ONLY', ?, ?, 'FICTIONAL_SAMPLE', 'SOURCE_POLICY_V2',
                            'USER_OWNED_AUTHORIZED', '{}', 'SCREENSHOT_TASK_V2')
                        """,
                screenshotTaskId, NOW, workflowId);
        jdbcTemplate.update("""
                        insert into ocr_task (
                            ocr_task_id, screenshot_task_id, ocr_provider, status, analysis_allowed,
                            parsed_at, workflow_id, candidate_schema_version, authority_type, provenance_json
                        ) values (?, ?, 'LOCAL_BROWSER', 'PARSED', true, ?, ?,
                            'OCR_CANDIDATE_V2', 'USER_SCREENSHOT_CONFIRMED', '{}')
                        """,
                ocrTaskId, screenshotTaskId, NOW, workflowId);
        jdbcTemplate.update("""
                        insert into ocr_confirmed_snapshot (
                            snapshot_id, ocr_task_id, source_type, snapshot_status, analysis_allowed,
                            risk_preference, budget_amount, currency, matches_json, markets_json,
                            payload_json, confirmed_at, workflow_id, confirmed_revision,
                            authority_type, provenance_json, schema_version
                        ) values (?, ?, 'USER_SCREENSHOT_CONFIRMED', 'CONFIRMED', true,
                            'BALANCED', 36.50, 'CNY', ?, ?, '{}', ?, ?, 7,
                            'SERVER_CONFIRMED_V2', '{}', 'CONFIRMED_SNAPSHOT_V2')
                        """,
                snapshotId,
                ocrTaskId,
                objectMapper.writeValueAsString(matches),
                objectMapper.writeValueAsString(markets),
                NOW,
                workflowId);
        return new AuthorityFixture(workflowId, snapshotId, matchId);
    }

    private String externalRequest(String snapshotId) {
        return """
                {
                  "snapshotId": "%s",
                  "engineMode": "OPENAI_COMPATIBLE",
                  "providerKey": "openai",
                  "modelId": "gpt-4o-mini",
                  "promptVersion": "danche-prediction-v1",
                  "analysisOptions": {
                    "targetTicketCount": 1,
                    "minTicketCount": 1,
                    "maxTicketCount": 1,
                    "maxParlayLegs": 1,
                    "mainTicketRatio": 1.00,
                    "defensiveTicketRatio": 0.00,
                    "entertainmentTicketRatio": 0.00,
                    "enableEntertainmentTicket": false,
                    "entertainmentTicketMaxCost": 0.00
                  }
                }
                """.formatted(snapshotId);
    }

    private JsonNode responseData(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
    }

    private String llmResponseBody(String content) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "choices", new Object[] {Map.of("message", Map.of("content", content))},
                "usage", Map.of(
                        "prompt_tokens", 101,
                        "completion_tokens", 202,
                        "total_tokens", 303)));
    }

    private static String validLlmOutput(String matchId) {
        return """
                {
                  "parameterUsage": {
                    "budgetAmount": 36.50,
                    "targetTicketCount": 1,
                    "maxParlayLegs": 1
                  },
                  "scorePredictions": [{"matchId": "%1$s", "mainScore": "2:1"}],
                  "upsetFocus": [],
                  "stableMatches": [{"matchId": "%1$s"}],
                  "ticketGroups": [{
                    "ticketType": "MAIN",
                    "cost": 36.50,
                    "legs": ["%1$s"],
                    "selections": [{
                      "matchId": "%1$s",
                      "playType": "WIN_DRAW_LOSS",
                      "selection": "HOME_WIN"
                    }]
                  }],
                  "finalDecision": {"summary": "validated structured llm result"},
                  "ledgerSnapshot": {"ticketCount": 1},
                  "complianceNotice": "非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议，不承诺命中率、收益或确定性结果。"
                }
                """.formatted(matchId);
    }

    private record AuthorityFixture(String workflowId, String snapshotId, String matchId) {
    }
}
