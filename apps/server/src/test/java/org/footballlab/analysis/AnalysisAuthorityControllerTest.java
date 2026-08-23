package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.analysis.service.MockRuleAnalysisEngine;
import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties =
        "spring.datasource.url=jdbc:h2:mem:analysis_authority_tests;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class AnalysisAuthorityControllerTest {

    private static final String NOW = "2026-08-23T14:00:00+08:00";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @SpyBean
    private MockRuleAnalysisEngine mockRuleAnalysisEngine;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("delete from workflow_operation");
        jdbcTemplate.update("delete from analysis_report");
        jdbcTemplate.update("delete from ocr_confirmed_snapshot");
        jdbcTemplate.update("delete from ocr_task");
        jdbcTemplate.update("delete from screenshot_task");
        jdbcTemplate.update("delete from ocr_workflow");
        reset(mockRuleAnalysisEngine);
    }

    @Test
    void generates201OnlyFromClosedV2SnapshotAuthority() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("closed");

        MvcResult result = mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(strictRequest(fixture.snapshotId())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andExpect(jsonPath("$.data.snapshotId").value(fixture.snapshotId()))
                .andExpect(jsonPath("$.data.workflowId").value(fixture.workflowId()))
                .andExpect(jsonPath("$.data.authorityRevision").value(7))
                .andExpect(jsonPath("$.data.authorityType").value("SERVER_GENERATED_ANALYSIS_V2"))
                .andExpect(jsonPath("$.data.strategyDefaultsVersion").value("STRATEGY_DEFAULTS_V2"))
                .andExpect(jsonPath("$.data.strategyParameters.budgetAmount").value(36.50))
                .andExpect(jsonPath("$.data.strategyParameters.currency").value("CNY"))
                .andExpect(jsonPath("$.data.strategyParameters.riskPreference").value("BALANCED"))
                .andExpect(jsonPath("$.data.probabilityAnalysis[0].matchId").value(fixture.matchId()))
                .andExpect(jsonPath("$.data.probabilityAnalysis[0].homeTeam").value("Database North"))
                .andExpect(jsonPath("$.data.simulatedSelections[0].selection").value("HOME_WIN"))
                .andExpect(jsonPath("$.data.simulatedSelections[0].odds").value(2.15))
                .andReturn();

        var persisted = analysisReportRepository.findV2ById(reportId(result)).orElseThrow();
        assertThat(persisted.workflowId()).isEqualTo(fixture.workflowId());
        assertThat(persisted.snapshotId()).isEqualTo(fixture.snapshotId());
        assertThat(persisted.authorityRevision()).isEqualTo(7L);
        assertThat(persisted.strategyParameters().budgetAmount()).isEqualByComparingTo("36.50");
        assertThat(jdbcTemplate.queryForObject(
                "select current_stage from ocr_workflow where workflow_id = ?",
                String.class,
                fixture.workflowId())).isEqualTo("ANALYSIS_GENERATED");
        assertThat(jdbcTemplate.queryForObject(
                "select current_report_id from ocr_workflow where workflow_id = ?",
                String.class,
                fixture.workflowId())).isEqualTo(persisted.reportId());
    }

    @Test
    void replaysSame201ReportWithoutInvokingRuleEngineTwice() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("replay");
        String idempotencyKey = UUID.randomUUID().toString();

        MvcResult first = performSuccessfulGenerate(fixture.snapshotId(), idempotencyKey);
        assertThat(analysisReportRepository.findV2ById(reportId(first))).isPresent();
        MvcResult replay = performSuccessfulGenerate(fixture.snapshotId(), idempotencyKey);

        assertThat(reportId(replay)).isEqualTo(reportId(first));
        verify(mockRuleAnalysisEngine, times(1)).generate(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rejectsClientAssertedAuthorityFieldsBeforeGeneration() throws Exception {
        String sentinel = "CLIENT_MATCH_SENTINEL";

        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "snapshotId": "snapshot-does-not-matter",
                                  "engineMode": "MOCK_RULE_ENGINE",
                                  "sourceType": "USER_SCREENSHOT_CONFIRMED",
                                  "matches": [{"homeTeam": "%s"}]
                                }
                                """.formatted(sentinel)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("CLIENT_ASSERTED_AUTHORITY_NOT_ALLOWED"));

        verify(mockRuleAnalysisEngine, times(0)).generate(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rejectsNewKeyAfterSuccessWithCurrentReportRecovery() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("already-generated");
        MvcResult first = performSuccessfulGenerate(fixture.snapshotId(), UUID.randomUUID().toString());
        String currentReportId = reportId(first);

        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(strictRequest(fixture.snapshotId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("ANALYSIS_ALREADY_GENERATED"))
                .andExpect(jsonPath("$.error.recovery.currentReportId").value(currentReportId));

        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from analysis_report where workflow_id = ?",
                Integer.class,
                fixture.workflowId())).isEqualTo(1);
        verify(mockRuleAnalysisEngine, times(1)).generate(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rejectsMissingSnapshot() throws Exception {
        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(strictRequest("snapshot-missing-" + UUID.randomUUID())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.errorCode").value("SNAPSHOT_NOT_FOUND"));

        verify(mockRuleAnalysisEngine, times(0)).generate(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rejectsLegacySnapshotAuthority() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("legacy");
        jdbcTemplate.update("""
                        update ocr_confirmed_snapshot
                        set schema_version = 'LEGACY_V1', authority_type = null
                        where snapshot_id = ?
                        """,
                fixture.snapshotId());

        performAuthorityRejection(fixture.snapshotId(), "SNAPSHOT_NOT_AUTHORITATIVE");
    }

    @Test
    void rejectsUnconfirmedSnapshotAuthority() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("unconfirmed");
        jdbcTemplate.update("""
                        update ocr_confirmed_snapshot
                        set snapshot_status = 'WAITING_USER_CONFIRMATION', analysis_allowed = false
                        where snapshot_id = ?
                        """,
                fixture.snapshotId());

        performAuthorityRejection(fixture.snapshotId(), "SNAPSHOT_NOT_AUTHORITATIVE");
    }

    @Test
    void rejectsSnapshotWithoutWorkflowAssociation() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("no-workflow");
        jdbcTemplate.update(
                "update ocr_confirmed_snapshot set workflow_id = null where snapshot_id = ?",
                fixture.snapshotId());

        performAuthorityRejection(fixture.snapshotId(), "SNAPSHOT_NOT_AUTHORITATIVE");
    }

    @Test
    void rejectsSnapshotThatIsNotCurrentForWorkflow() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("wrong-current");
        jdbcTemplate.update(
                "update ocr_workflow set confirmed_snapshot_id = ? where workflow_id = ?",
                "snapshot-unrelated-" + UUID.randomUUID(),
                fixture.workflowId());

        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(strictRequest(fixture.snapshotId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("SNAPSHOT_WORKFLOW_MISMATCH"));

        verify(mockRuleAnalysisEngine, times(0)).generate(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rejectsUnknownTopLevelAndNestedOptionFields() throws Exception {
        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "snapshotId": "snapshot-unknown",
                                  "engineMode": "MOCK_RULE_ENGINE",
                                  "rogueField": "not-allowed"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("UNKNOWN_FIELD"))
                .andExpect(jsonPath("$.error.fieldErrors[0].fieldPath").value("rogueField"));

        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "snapshotId": "snapshot-unknown",
                                  "engineMode": "MOCK_RULE_ENGINE",
                                  "analysisOptions": {"rogueField": true}
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("UNKNOWN_FIELD"))
                .andExpect(jsonPath("$.error.fieldErrors[0].fieldPath")
                        .value("analysisOptions.rogueField"));

        verify(mockRuleAnalysisEngine, times(0)).generate(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void persistsDeterministicCorruptedMarketFailureAndReplaysIt() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("corrupt-market");
        jdbcTemplate.update(
                "update ocr_confirmed_snapshot set markets_json = ? where snapshot_id = ?",
                objectMapper.writeValueAsString(List.of(new ConfirmedMarketResponse(
                        "market-corrupt",
                        fixture.matchId(),
                        "EXACT_SCORE",
                        "2:1",
                        new BigDecimal("7.5000")))),
                fixture.snapshotId());
        String idempotencyKey = UUID.randomUUID().toString();

        performStableFailure(fixture.snapshotId(), idempotencyKey, "UNSUPPORTED_ANALYSIS_MARKET", 400);
        performStableFailure(fixture.snapshotId(), idempotencyKey, "UNSUPPORTED_ANALYSIS_MARKET", 400);

        assertThat(jdbcTemplate.queryForObject(
                "select operation_status from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo("FAILED");
        assertThat(jdbcTemplate.queryForObject(
                "select error_code from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo("UNSUPPORTED_ANALYSIS_MARKET");
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from analysis_report where workflow_id = ?",
                Integer.class,
                fixture.workflowId())).isZero();
        assertWorkflowStillConfirmed(fixture.workflowId());
        verify(mockRuleAnalysisEngine, times(0)).generate(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rollsBackInsertFailureAndReplaysStablePersistenceFailure() throws Exception {
        AuthorityFixture fixture = insertConfirmedV2Fixture("insert-failure");
        insertPreexistingWorkflowReport(fixture);
        String idempotencyKey = UUID.randomUUID().toString();

        performStableFailure(fixture.snapshotId(), idempotencyKey, "ANALYSIS_PERSISTENCE_FAILED", 500);
        performStableFailure(fixture.snapshotId(), idempotencyKey, "ANALYSIS_PERSISTENCE_FAILED", 500);

        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from analysis_report where workflow_id = ?",
                Integer.class,
                fixture.workflowId())).isEqualTo(1);
        assertWorkflowStillConfirmed(fixture.workflowId());
        assertThat(jdbcTemplate.queryForObject(
                "select operation_status from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo("FAILED");
        assertThat(jdbcTemplate.queryForObject(
                "select error_code from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo("ANALYSIS_PERSISTENCE_FAILED");
        verify(mockRuleAnalysisEngine, times(1)).generate(org.mockito.ArgumentMatchers.any());
    }

    private MvcResult performSuccessfulGenerate(String snapshotId, String idempotencyKey) throws Exception {
        return mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(strictRequest(snapshotId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andReturn();
    }

    private void performAuthorityRejection(String snapshotId, String errorCode) throws Exception {
        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(strictRequest(snapshotId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value(errorCode));

        verify(mockRuleAnalysisEngine, times(0)).generate(org.mockito.ArgumentMatchers.any());
    }

    private void performStableFailure(
            String snapshotId,
            String idempotencyKey,
            String errorCode,
            int httpStatus) throws Exception {
        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(strictRequest(snapshotId)))
                .andExpect(status().is(httpStatus))
                .andExpect(jsonPath("$.error.errorCode").value(errorCode));
    }

    private void assertWorkflowStillConfirmed(String workflowId) {
        assertThat(jdbcTemplate.queryForObject(
                "select current_stage from ocr_workflow where workflow_id = ?",
                String.class,
                workflowId)).isEqualTo("CONFIRMED");
        assertThat(jdbcTemplate.queryForObject(
                "select current_report_id from ocr_workflow where workflow_id = ?",
                String.class,
                workflowId)).isNull();
    }

    private void insertPreexistingWorkflowReport(AuthorityFixture fixture) {
        jdbcTemplate.update("""
                        insert into analysis_report (
                            report_id, snapshot_id, input_source_type, engine_type, report_status,
                            probability_analysis_json, risk_warnings_json, simulated_selections_json,
                            compliance_notice, payload_json, generated_at, workflow_id
                        ) values (?, ?, 'USER_SCREENSHOT_CONFIRMED', 'MOCK_RULE_ENGINE', 'GENERATED',
                            '[]', '[]', '[]', 'Existing report fixture.', null, ?, ?)
                        """,
                "analysis-existing-" + UUID.randomUUID(),
                fixture.snapshotId(),
                NOW,
                fixture.workflowId());
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

    private String strictRequest(String snapshotId) {
        return """
                {
                  "snapshotId": "%s",
                  "engineMode": "MOCK_RULE_ENGINE",
                  "analysisOptions": {
                    "targetTicketCount": 1,
                    "minTicketCount": 1,
                    "maxTicketCount": 1,
                    "maxParlayLegs": 1
                  }
                }
                """.formatted(snapshotId);
    }

    private String reportId(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data")
                .path("reportId")
                .asText();
    }

    private record AuthorityFixture(String workflowId, String snapshotId, String matchId) {
    }
}
