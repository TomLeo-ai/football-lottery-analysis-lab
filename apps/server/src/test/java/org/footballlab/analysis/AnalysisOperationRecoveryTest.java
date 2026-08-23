package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.llm.service.LlmHttpTransport;
import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.service.RequestHashService;
import org.footballlab.workflow.service.WorkflowOperationRecoveryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:analysis_operation_recovery_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@Import(AnalysisOperationRecoveryTest.FixedClockConfiguration.class)
@AutoConfigureMockMvc
class AnalysisOperationRecoveryTest {

    @Autowired
    private WorkflowOperationRecoveryService recoveryService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RequestHashService requestHashService;

    @MockBean
    private LlmHttpTransport llmHttpTransport;

    @Test
    void recoversAtFifteenMinutesAndOriginalKeyReplaysInterruptedTwiceWithoutProviderCall() throws Exception {
        String suffix = UUID.randomUUID().toString();
        String workflowId = "workflow-recovery-" + suffix;
        String operationKey = UUID.randomUUID().toString();
        String screenshotTaskId = "shot-recovery-" + suffix;
        String ocrTaskId = "ocr-recovery-" + suffix;
        String snapshotId = "snapshot-recovery-" + suffix;
        String matchId = "match-recovery-" + suffix;
        List<ConfirmedMatchResponse> matches = List.of(new ConfirmedMatchResponse(
                matchId,
                "2026-08-24",
                "Recovery League",
                "Recovery North",
                "Recovery South",
                "2026-08-24T19:30:00+08:00"));
        List<ConfirmedMarketResponse> markets = List.of(new ConfirmedMarketResponse(
                "market-recovery-" + suffix,
                matchId,
                "WIN_DRAW_LOSS",
                "HOME_WIN",
                new BigDecimal("2.1500")));
        jdbcTemplate.update("""
                        insert into ocr_workflow (
                            workflow_id, current_stage, version, current_ocr_task_id,
                            confirmed_snapshot_id, current_report_id, current_plan_id,
                            active_operation_type, active_operation_key, created_at, updated_at
                        ) values (?, 'CONFIRMED', 4, ?, ?, null, null,
                            'GENERATE_ANALYSIS', ?, ?, ?)
                        """,
                workflowId,
                ocrTaskId,
                snapshotId,
                operationKey,
                "2026-08-23T15:45:00+08:00",
                "2026-08-23T16:00:01+08:00");
        jdbcTemplate.update("""
                        insert into screenshot_task (
                            task_id, file_name, content_type, file_size, sample_label, status,
                            server_ocr_enabled, privacy_policy, created_at, workflow_id,
                            source_declaration, source_policy_version, authority_type, provenance_json, schema_version
                        ) values (?, 'recovery.png', 'image/png', 1024, 'FICTIONAL_SAMPLE', 'CREATED',
                            false, 'LOCAL_ONLY', ?, ?, 'FICTIONAL_SAMPLE', 'SOURCE_POLICY_V2',
                            'USER_OWNED_AUTHORIZED', '{}', 'SCREENSHOT_TASK_V2')
                        """,
                screenshotTaskId,
                "2026-08-23T15:45:00+08:00",
                workflowId);
        jdbcTemplate.update("""
                        insert into ocr_task (
                            ocr_task_id, screenshot_task_id, ocr_provider, status, analysis_allowed,
                            parsed_at, workflow_id, candidate_schema_version, authority_type, provenance_json
                        ) values (?, ?, 'LOCAL_BROWSER', 'PARSED', true, ?, ?,
                            'OCR_CANDIDATE_V2', 'USER_SCREENSHOT_CONFIRMED', '{}')
                        """,
                ocrTaskId,
                screenshotTaskId,
                "2026-08-23T15:45:00+08:00",
                workflowId);
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
                "2026-08-23T15:45:00+08:00",
                workflowId);
        jdbcTemplate.update("""
                        insert into workflow_operation (
                            idempotency_key, workflow_id, operation_type, request_sha256,
                            operation_status, result_type, result_id, error_code, http_status,
                            created_at, updated_at
                        ) values (?, ?, 'GENERATE_ANALYSIS', ?, 'IN_PROGRESS',
                            null, null, null, null, ?, ?)
                        """,
                operationKey,
                workflowId,
                externalRequestHash(snapshotId),
                "2026-08-23T15:45:00+08:00",
                "2026-08-23T16:00:01+08:00");

        assertThat(recoveryService.recoverStaleAnalysisOperations()).isZero();
        assertThat(operationStatus(operationKey)).isEqualTo("IN_PROGRESS");
        assertThat(activeOperationKey(workflowId)).isEqualTo(operationKey);

        jdbcTemplate.update(
                "update workflow_operation set updated_at = ? where idempotency_key = ?",
                "2026-08-23T16:00:00+08:00",
                operationKey);

        assertThat(recoveryService.recoverStaleAnalysisOperations()).isEqualTo(1);
        assertThat(operationStatus(operationKey)).isEqualTo("INTERRUPTED");
        assertThat(activeOperationKey(workflowId)).isNull();
        assertThat(jdbcTemplate.queryForObject(
                "select error_code from workflow_operation where idempotency_key = ?",
                String.class,
                operationKey)).isEqualTo("OPERATION_INTERRUPTED");

        for (int attempt = 0; attempt < 2; attempt++) {
            mockMvc.perform(post("/api/analysis/generate")
                            .header("Idempotency-Key", operationKey)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(externalRequest(snapshotId)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.errorCode").value("OPERATION_INTERRUPTED"));
        }
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from llm_invocation_audit",
                Integer.class)).isZero();
        verifyNoInteractions(llmHttpTransport);
    }

    private String externalRequestHash(String snapshotId) {
        Map<String, Object> engine = new LinkedHashMap<>();
        engine.put("engineMode", "OPENAI_COMPATIBLE");
        engine.put("providerKey", "openai");
        engine.put("modelId", "gpt-4o-mini");
        engine.put("promptVersion", "danche-prediction-v1");

        Map<String, Object> options = new LinkedHashMap<>();
        options.put("budgetAmount", new BigDecimal("36.50"));
        options.put("currency", "CNY");
        options.put("targetTicketCount", 1);
        options.put("minTicketCount", 1);
        options.put("maxTicketCount", 1);
        options.put("riskPreference", "BALANCED");
        options.put("mainTicketRatio", new BigDecimal("1.00"));
        options.put("defensiveTicketRatio", new BigDecimal("0.00"));
        options.put("entertainmentTicketRatio", new BigDecimal("0.00"));
        options.put("enableEntertainmentTicket", false);
        options.put("entertainmentTicketMaxCost", new BigDecimal("0.00"));
        options.put("maxParlayLegs", 1);
        options.put("preferredPlayTypes", List.of("WIN_DRAW_LOSS"));
        options.put("excludedPlayTypes", List.of());
        options.put("exactScorePolicy", "DISABLED");
        options.put("minPayoutRequirement", null);
        options.put("allowLowReturnTicket", false);
        options.put("upsetCoverageLevel", "BALANCED");
        options.put("defaultsVersion", "STRATEGY_DEFAULTS_V2");

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("snapshotId", snapshotId);
        fields.put("engineConfiguration", engine);
        fields.put("resolvedOptions", options);
        return requestHashService.hash(
                WorkflowOperationType.GENERATE_ANALYSIS,
                "POST",
                "/api/analysis/generate",
                fields);
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
                    "mainTicketRatio": 1.00,
                    "defensiveTicketRatio": 0.00,
                    "entertainmentTicketRatio": 0.00,
                    "enableEntertainmentTicket": false,
                    "entertainmentTicketMaxCost": 0.00,
                    "maxParlayLegs": 1,
                    "allowLowReturnTicket": false,
                    "upsetCoverageLevel": "BALANCED"
                  }
                }
                """.formatted(snapshotId);
    }

    private String operationStatus(String operationKey) {
        return jdbcTemplate.queryForObject(
                "select operation_status from workflow_operation where idempotency_key = ?",
                String.class,
                operationKey);
    }

    private String activeOperationKey(String workflowId) {
        return jdbcTemplate.queryForObject(
                "select active_operation_key from ocr_workflow where workflow_id = ?",
                String.class,
                workflowId);
    }

    @TestConfiguration
    static class FixedClockConfiguration {

        @Bean
        @Primary
        Clock recoveryTestClock() {
            return Clock.fixed(Instant.parse("2026-08-23T08:15:00Z"), ZoneOffset.UTC);
        }
    }
}
