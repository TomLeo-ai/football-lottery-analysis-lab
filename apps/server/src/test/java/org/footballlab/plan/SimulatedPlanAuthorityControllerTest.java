package org.footballlab.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties =
        "spring.datasource.url=jdbc:h2:mem:plan_authority_tests;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class SimulatedPlanAuthorityControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.update("delete from review_record");
        jdbcTemplate.update("delete from simulated_plan_item");
        jdbcTemplate.update("delete from simulated_plan");
        jdbcTemplate.update("delete from workflow_operation");
        jdbcTemplate.update("delete from analysis_report");
        jdbcTemplate.update("delete from ocr_confirmed_snapshot");
        jdbcTemplate.update("delete from ocr_task");
        jdbcTemplate.update("delete from screenshot_task");
        jdbcTemplate.update("delete from ocr_workflow");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "snapshotId", "inputSourceType", "engineType", "reportStatus", "currency",
            "budgetAmount", "strategyParameters", "probabilityAnalysis", "riskWarnings",
            "simulatedSelections", "totallyUnknown"
    })
    void rejectsEveryClientAssertedReportFieldBeforeOperationReservation(String fieldName) throws Exception {
        int before = operationCount();
        mockMvc.perform(post("/api/strategies/simulate")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reportId":"analysis-client-forged","%s":{}}
                                """.formatted(fieldName)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("CLIENT_ASSERTED_REPORT_NOT_ALLOWED"));
        assertThat(operationCount()).isEqualTo(before);
        assertThat(planCount()).isZero();
    }

    @Test
    void rejectsUnknownSaveBodyAndOverlongNoteBeforeOperationReservation() throws Exception {
        int before = operationCount();
        mockMvc.perform(post("/api/simulated-plans")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"generatedPlanId":"plan-forged","items":[]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("CLIENT_ASSERTED_REPORT_NOT_ALLOWED"));
        mockMvc.perform(post("/api/simulated-plans")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "generatedPlanId", "plan-forged",
                                "operatorNote", "x".repeat(513)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("VALIDATION_FAILED"));
        assertThat(operationCount()).isEqualTo(before);
    }

    @Test
    void rejectsMissingReportWithoutCreatingPlan() throws Exception {
        performRejected("analysis-missing-" + UUID.randomUUID(), "REPORT_NOT_FOUND", 404);
        assertThat(planCount()).isZero();
    }

    @Test
    void rejectsLegacyReportAsStateConflict() throws Exception {
        AuthoritativePlanTestFixture.Fixture fixture = fixture();
        String legacyId = "legacy-report-" + UUID.randomUUID();
        jdbcTemplate.update("""
                        insert into analysis_report (
                            report_id, snapshot_id, input_source_type, engine_type, report_status,
                            probability_analysis_json, risk_warnings_json, simulated_selections_json,
                            compliance_notice, payload_json, generated_at
                        ) values (?, ?, 'USER_SCREENSHOT_CONFIRMED', 'MOCK_RULE_ENGINE', 'GENERATED',
                            '[]', '[]', '[]', 'Legacy.', '{}', ?)
                        """,
                legacyId, fixture.snapshotId(), AuthoritativePlanTestFixture.NOW);

        performRejected(legacyId, "REPORT_STATE_CONFLICT", 409);
        assertWorkflowUnchanged(fixture.workflowId());
    }

    @Test
    void rejectsUnsafeOrNonGeneratedReport() throws Exception {
        AuthoritativePlanTestFixture.Fixture blocked = AuthoritativePlanTestFixture.insert(
                jdbcTemplate,
                objectMapper,
                analysisReportRepository,
                report -> AuthoritativePlanTestFixture.copyReport(
                        report, "GENERATED", "BLOCKED", report.simulatedSelections()));
        performRejected(blocked.reportId(), "REPORT_STATE_CONFLICT", 409);
        assertWorkflowUnchanged(blocked.workflowId());

        AuthoritativePlanTestFixture.Fixture error = AuthoritativePlanTestFixture.insert(
                jdbcTemplate,
                objectMapper,
                analysisReportRepository,
                report -> AuthoritativePlanTestFixture.copyReport(
                        report, "ERROR", "PASSED", report.simulatedSelections()));
        performRejected(error.reportId(), "REPORT_STATE_CONFLICT", 409);
        assertWorkflowUnchanged(error.workflowId());
    }

    @Test
    void rejectsReportWorkflowLineageMismatch() throws Exception {
        AuthoritativePlanTestFixture.Fixture fixture = fixture();
        jdbcTemplate.update("update ocr_workflow set current_report_id = null where workflow_id = ?", fixture.workflowId());

        performRejected(fixture.reportId(), "REPORT_STATE_CONFLICT", 409);
        assertThat(planCount(fixture.workflowId())).isZero();
        assertThat(stage(fixture.workflowId())).isEqualTo("ANALYSIS_GENERATED");
    }

    @ParameterizedTest
    @ValueSource(strings = {"HANDICAP_WIN_DRAW_LOSS", "WIN_DRAW_LOSS"})
    void independentlyRejectsNonWdlOrIllegalSelectionInSelfConsistentReport(String playType) throws Exception {
        AuthoritativePlanTestFixture.Fixture fixture = AuthoritativePlanTestFixture.insert(
                jdbcTemplate,
                objectMapper,
                analysisReportRepository,
                report -> AuthoritativePlanTestFixture.copyReport(
                        report,
                        "GENERATED",
                        "PASSED",
                        List.of(new SimulatedSelectionResponse(
                                report.probabilityAnalysis().get(0).matchId(),
                                playType,
                                "HANDICAP_WIN_DRAW_LOSS".equals(playType) ? "HOME_WIN" : "SURE_WIN",
                                new BigDecimal("2.1500"),
                                new BigDecimal("12.50"),
                                "Invalid persisted selection."))));

        performRejected(fixture.reportId(), "REPORT_STATE_CONFLICT", 409);
        assertWorkflowUnchanged(fixture.workflowId());
    }

    private AuthoritativePlanTestFixture.Fixture fixture() throws Exception {
        return AuthoritativePlanTestFixture.insert(jdbcTemplate, objectMapper, analysisReportRepository);
    }

    private void performRejected(String reportId, String errorCode, int httpStatus) throws Exception {
        mockMvc.perform(post("/api/strategies/simulate")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reportId":"%s"}
                                """.formatted(reportId)))
                .andExpect(status().is(httpStatus))
                .andExpect(jsonPath("$.error.errorCode").value(errorCode));
    }

    private void assertWorkflowUnchanged(String workflowId) {
        assertThat(stage(workflowId)).isEqualTo("ANALYSIS_GENERATED");
        assertThat(planCount(workflowId)).isZero();
    }

    private String stage(String workflowId) {
        return jdbcTemplate.queryForObject(
                "select current_stage from ocr_workflow where workflow_id = ?", String.class, workflowId);
    }

    private int operationCount() {
        return jdbcTemplate.queryForObject("select count(*) from workflow_operation", Integer.class);
    }

    private int planCount() {
        return jdbcTemplate.queryForObject("select count(*) from simulated_plan", Integer.class);
    }

    private int planCount(String workflowId) {
        return jdbcTemplate.queryForObject(
                "select count(*) from simulated_plan where workflow_id = ?", Integer.class, workflowId);
    }
}
