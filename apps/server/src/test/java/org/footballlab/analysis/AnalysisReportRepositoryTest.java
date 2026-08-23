package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.RiskWarningResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.analysis.persistence.AnalysisReportPayloadV2;
import org.footballlab.analysis.persistence.AnalysisReportV2Record;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.analysis.repository.JdbcAnalysisReportRepository;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.footballlab.strategy.service.StrategyParameterDefaultsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties =
        "spring.datasource.url=jdbc:h2:mem:analysis_report_v2_tests;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
class AnalysisReportRepositoryTest {

    @Autowired
    private AnalysisReportRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldPersistAnalysisReportAndReadItWithANewRepositoryInstance() {
        String suffix = UUID.randomUUID().toString();
        AnalysisReportResponse report = new AnalysisReportResponse(
                "analysis-repo-" + suffix,
                "snapshot-repo-" + suffix,
                "USER_SCREENSHOT_CONFIRMED",
                "MOCK_RULE_ENGINE",
                "GENERATED",
                new StrategyParameterRequest(
                        BigDecimal.valueOf(20).setScale(2),
                        "CNY",
                        5,
                        5,
                        6,
                        "BALANCED",
                        BigDecimal.valueOf(0.6),
                        BigDecimal.valueOf(0.3),
                        BigDecimal.valueOf(0.1),
                        true,
                        BigDecimal.valueOf(2).setScale(2),
                        4,
                        List.of("WIN_DRAW_LOSS", "HANDICAP_WIN_DRAW_LOSS"),
                        List.of(),
                        "ENTERTAINMENT_ONLY",
                        null,
                        false,
                        "BALANCED"),
                List.of(new ProbabilityInsightResponse(
                        "demo-match-001",
                        "2026-07-01",
                        "Fictional Coastal League",
                        "2026-07-01T19:30:00+08:00",
                        "Northport United",
                        "Lakeside City",
                        "HOME_WIN",
                        "MEDIUM",
                        "Repository persistence test.")),
                List.of(new RiskWarningResponse(
                        "INFO_RISK",
                        "MEDIUM",
                        "仅基于用户确认快照与虚构样例字段。")),
                List.of(new SimulatedSelectionResponse(
                        "demo-match-001",
                        "WIN_DRAW_LOSS",
                        "HOME_WIN",
                        BigDecimal.valueOf(2.05),
                        BigDecimal.valueOf(10),
                        "模拟选择，用于验证分析报告落库。")),
                "非官方，仅模拟分析/复盘；仅供技术研究和流程验证，不构成确定性建议。",
                "2026-06-26T11:00:00+08:00",
                null,
                null,
                null,
                "PASSED",
                null,
                null);

        repository.save(report);

        AnalysisReportRepository reloadedRepository = new JdbcAnalysisReportRepository(jdbcTemplate, objectMapper);

        assertThat(reloadedRepository.findById(report.reportId()))
                .isPresent()
                .get()
                .satisfies(reloaded -> {
                    assertThat(reloaded.reportId()).isEqualTo(report.reportId());
                    assertThat(reloaded.engineType()).isEqualTo("MOCK_RULE_ENGINE");
                    assertThat(reloaded.reportStatus()).isEqualTo("GENERATED");
                    assertThat(reloaded.strategyParameters().budgetAmount()).isEqualByComparingTo("20.00");
                    assertThat(reloaded.probabilityAnalysis()).hasSize(1);
                    assertThat(reloaded.simulatedSelections()).hasSize(1);
                    assertThat(reloaded.safetyStatus()).isEqualTo("PASSED");
                    assertThat(reloaded.providerKey()).isNull();
                    assertThat(reloaded.llmOutput() == null || reloaded.llmOutput().isNull()).isTrue();
                });
        assertThat(reloadedRepository.nextReportSequence()).isGreaterThanOrEqualTo(1L);
    }

    @Test
    void shouldRoundTripV2AnalysisReportAcrossAllRepositoryLookups() {
        String suffix = UUID.randomUUID().toString();
        V2LineageFixture fixture = insertV2LineageFixture(suffix);
        AnalysisReportV2Record report = createV2Report(fixture, suffix);

        repository.insertV2(report);

        AnalysisReportRepository reloadedRepository = new JdbcAnalysisReportRepository(jdbcTemplate, objectMapper);
        assertThat(jdbcTemplate.queryForObject(
                "select authority_snapshot_id from analysis_report where report_id = ?",
                String.class,
                report.reportId()))
                .isEqualTo(report.snapshotId());
        assertThat(reloadedRepository.findV2ById(report.reportId()))
                .hasValueSatisfying(reloaded -> assertV2ReportContent(report, reloaded));
        assertThat(reloadedRepository.findV2ByWorkflowId(report.workflowId()))
                .hasValueSatisfying(reloaded -> assertV2ReportContent(report, reloaded));
        assertThat(reloadedRepository.findById(report.reportId()))
                .hasValueSatisfying(reloaded -> {
                    assertThat(reloaded.workflowId()).isEqualTo(report.workflowId());
                    assertThat(reloaded.snapshotId()).isEqualTo(report.snapshotId());
                    assertThat(reloaded.authorityRevision()).isEqualTo(1L);
                    assertThat(reloaded.authorityType()).isEqualTo(AnalysisReportV2Record.AUTHORITY_TYPE);
                    assertThat(reloaded.schemaVersion()).isEqualTo(AnalysisReportPayloadV2.SCHEMA_VERSION);
                    assertThat(reloaded.strategyDefaultsVersion())
                            .isEqualTo(StrategyParameterDefaultsService.V2_DEFAULTS_VERSION);
                    assertThat(reloaded.engineType()).isEqualTo("OPENAI_COMPATIBLE");
                    assertThat(reloaded.strategyParameters()).isEqualTo(report.strategyParameters());
                    assertThat(reloaded.providerKey()).isEqualTo("mock-provider");
                    assertThat(reloaded.modelId()).isEqualTo("mock-model");
                    assertThat(reloaded.promptVersion()).isEqualTo("prompt-v2");
                    assertThat(reloaded.safetyStatus()).isEqualTo("PASSED");
                    assertThat(reloaded.probabilityAnalysis()).singleElement()
                            .extracting(ProbabilityInsightResponse::selection)
                            .isEqualTo("HOME_WIN");
                    assertThat(reloaded.riskWarnings()).singleElement()
                            .extracting(RiskWarningResponse::riskCode)
                            .isEqualTo("VOLATILITY_RISK");
                    assertThat(reloaded.simulatedSelections()).singleElement()
                            .extracting(SimulatedSelectionResponse::selection)
                            .isEqualTo("HOME_WIN");
                    assertThat(reloaded.llmOutput().path("summary").asText())
                            .isEqualTo("Structured v2 repository output.");
                });
    }

    @Test
    void shouldRejectV2ReportWhenPayloadSnapshotIdIsTampered() throws Exception {
        String suffix = UUID.randomUUID().toString();
        V2LineageFixture fixture = insertV2LineageFixture(suffix);
        AnalysisReportV2Record report = createV2Report(fixture, suffix);
        repository.insertV2(report);

        String payloadJson = jdbcTemplate.queryForObject(
                "select payload_json from analysis_report where report_id = ?",
                String.class,
                report.reportId());
        ObjectNode tamperedPayload = (ObjectNode) objectMapper.readTree(payloadJson);
        tamperedPayload.put("snapshotId", "snapshot-tampered-" + suffix);
        jdbcTemplate.update(
                "update analysis_report set payload_json = ? where report_id = ?",
                objectMapper.writeValueAsString(tamperedPayload),
                report.reportId());

        assertThatThrownBy(() -> repository.findV2ById(report.reportId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("snapshotId");
    }

    @Test
    void shouldRejectV2CandidateWhenStructuredSchemaVersionIsCleared() {
        String suffix = UUID.randomUUID().toString();
        V2LineageFixture fixture = insertV2LineageFixture(suffix);
        AnalysisReportV2Record report = createV2Report(fixture, suffix);
        repository.insertV2(report);

        jdbcTemplate.update(
                "update analysis_report set schema_version = null where report_id = ?",
                report.reportId());

        assertThatThrownBy(() -> repository.findAnyById(report.reportId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("schemaVersion");
    }

    @Test
    void shouldRejectV2ReportWhenProbabilityProjectionIsTampered() {
        String suffix = UUID.randomUUID().toString();
        V2LineageFixture fixture = insertV2LineageFixture(suffix);
        AnalysisReportV2Record report = createV2Report(fixture, suffix);
        repository.insertV2(report);

        jdbcTemplate.update(
                "update analysis_report set probability_analysis_json = '[]' where report_id = ?",
                report.reportId());

        assertThatThrownBy(() -> repository.findAnyById(report.reportId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("probabilityAnalysis");
    }

    @Test
    void shouldRejectV2ReportWhenAuthoritySnapshotIdIsCleared() {
        String suffix = UUID.randomUUID().toString();
        V2LineageFixture fixture = insertV2LineageFixture(suffix);
        AnalysisReportV2Record report = createV2Report(fixture, suffix);
        repository.insertV2(report);

        jdbcTemplate.update(
                "update analysis_report set authority_snapshot_id = null where report_id = ?",
                report.reportId());

        assertThatThrownBy(() -> repository.findAnyById(report.reportId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("authoritySnapshotId");
    }

    @Test
    void shouldRejectSqlNullProjectionWhenPayloadContainsAnEmptyList() {
        String suffix = UUID.randomUUID().toString();
        V2LineageFixture fixture = insertV2LineageFixture(suffix);
        AnalysisReportV2Record report = copyWithProjectionLists(
                createV2Report(fixture, suffix),
                List.of(),
                List.of(new RiskWarningResponse("INFO_RISK", "LOW", "Empty probability list is intentional.")),
                List.of());
        repository.insertV2(report);

        jdbcTemplate.update(
                "update analysis_report set probability_analysis_json = null where report_id = ?",
                report.reportId());

        assertThatThrownBy(() -> repository.findAnyById(report.reportId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("probabilityAnalysis");
    }

    @Test
    void shouldRejectNullProjectionListsWhenConstructingV2Report() {
        String suffix = UUID.randomUUID().toString();
        AnalysisReportV2Record report = createV2Report(
                new V2LineageFixture("workflow-unit-" + suffix, "snapshot-unit-" + suffix),
                suffix);

        assertThatThrownBy(() -> copyWithProjectionLists(
                report,
                null,
                report.riskWarnings(),
                report.simulatedSelections()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("probabilityAnalysis");
        assertThatThrownBy(() -> copyWithProjectionLists(
                report,
                report.probabilityAnalysis(),
                null,
                report.simulatedSelections()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("riskWarnings");
        assertThatThrownBy(() -> copyWithProjectionLists(
                report,
                report.probabilityAnalysis(),
                report.riskWarnings(),
                null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("simulatedSelections");
    }

    private V2LineageFixture insertV2LineageFixture(String suffix) {
        String workflowId = "workflow-v2-" + suffix;
        String screenshotTaskId = "screenshot-v2-" + suffix;
        String ocrTaskId = "ocr-v2-" + suffix;
        String snapshotId = "snapshot-v2-" + suffix;
        String timestamp = "2026-08-23T10:00:00+08:00";

        jdbcTemplate.update("""
                        insert into ocr_workflow (
                            workflow_id, current_stage, version, created_at, updated_at
                        ) values (?, 'CONFIRMED', 1, ?, ?)
                        """,
                workflowId,
                timestamp,
                timestamp);
        jdbcTemplate.update("""
                        insert into screenshot_task (
                            task_id, file_name, content_type, file_size, sample_label, status,
                            server_ocr_enabled, privacy_policy, created_at, workflow_id
                        ) values (?, 'v2-report-fixture.png', 'image/png', 1024, 'FICTIONAL_SAMPLE',
                            'CREATED', false, 'LOCAL_ONLY', ?, ?)
                        """,
                screenshotTaskId,
                timestamp,
                workflowId);
        jdbcTemplate.update("""
                        insert into ocr_task (
                            ocr_task_id, screenshot_task_id, ocr_provider, status,
                            analysis_allowed, parsed_at, workflow_id
                        ) values (?, ?, 'LOCAL_BROWSER', 'PARSED', true, ?, ?)
                        """,
                ocrTaskId,
                screenshotTaskId,
                timestamp,
                workflowId);
        jdbcTemplate.update("""
                        insert into ocr_confirmed_snapshot (
                            snapshot_id, ocr_task_id, source_type, snapshot_status,
                            analysis_allowed, confirmed_at, workflow_id, confirmed_revision
                        ) values (?, ?, 'USER_SCREENSHOT_CONFIRMED', 'CONFIRMED', true, ?, ?, 1)
                        """,
                snapshotId,
                ocrTaskId,
                timestamp,
                workflowId);
        return new V2LineageFixture(workflowId, snapshotId);
    }

    private AnalysisReportV2Record createV2Report(V2LineageFixture fixture, String suffix) {
        return new AnalysisReportV2Record(
                fixture.workflowId(),
                "analysis-v2-" + suffix,
                fixture.snapshotId(),
                1L,
                AnalysisReportV2Record.AUTHORITY_TYPE,
                "USER_SCREENSHOT_CONFIRMED",
                "OPENAI_COMPATIBLE",
                "GENERATED",
                new StrategyParameterRequest(
                        BigDecimal.valueOf(30).setScale(2),
                        "CNY",
                        10,
                        10,
                        10,
                        "BALANCED",
                        BigDecimal.valueOf(0.6),
                        BigDecimal.valueOf(0.3),
                        BigDecimal.valueOf(0.1),
                        true,
                        BigDecimal.valueOf(2).setScale(2),
                        4,
                        List.of("WIN_DRAW_LOSS"),
                        List.of(),
                        "ENTERTAINMENT_ONLY",
                        null,
                        false,
                        "BALANCED"),
                StrategyParameterDefaultsService.V2_DEFAULTS_VERSION,
                List.of(new ProbabilityInsightResponse(
                        "demo-match-v2",
                        "2026-08-24",
                        "Fictional Coastal League",
                        "2026-08-24T19:30:00+08:00",
                        "Northport United",
                        "Lakeside City",
                        "HOME_WIN",
                        "MEDIUM",
                        "Structured v2 probability analysis.")),
                List.of(new RiskWarningResponse(
                        "VOLATILITY_RISK",
                        "MEDIUM",
                        "Odds can change before kickoff.")),
                List.of(new SimulatedSelectionResponse(
                        "demo-match-v2",
                        "WIN_DRAW_LOSS",
                        "HOME_WIN",
                        BigDecimal.valueOf(2.05),
                        BigDecimal.valueOf(10).setScale(2),
                        "Structured v2 simulated selection.")),
                "非官方，仅模拟分析；仅供技术研究和流程验证。",
                "2026-08-23T10:05:00+08:00",
                "mock-provider",
                "mock-model",
                "prompt-v2",
                "PASSED",
                "llm-audit-v2-" + suffix,
                objectMapper.createObjectNode().put("summary", "Structured v2 repository output."));
    }

    private AnalysisReportV2Record copyWithProjectionLists(
            AnalysisReportV2Record report,
            List<ProbabilityInsightResponse> probabilityAnalysis,
            List<RiskWarningResponse> riskWarnings,
            List<SimulatedSelectionResponse> simulatedSelections) {
        return new AnalysisReportV2Record(
                report.workflowId(),
                report.reportId(),
                report.snapshotId(),
                report.authorityRevision(),
                report.authorityType(),
                report.inputSourceType(),
                report.engineType(),
                report.reportStatus(),
                report.strategyParameters(),
                report.strategyDefaultsVersion(),
                probabilityAnalysis,
                riskWarnings,
                simulatedSelections,
                report.complianceNotice(),
                report.generatedAt(),
                report.providerKey(),
                report.modelId(),
                report.promptVersion(),
                report.safetyStatus(),
                report.llmAuditId(),
                report.llmOutput());
    }

    private void assertV2ReportContent(AnalysisReportV2Record expected, AnalysisReportV2Record reloaded) {
        assertThat(reloaded.reportId()).isEqualTo(expected.reportId());
        assertThat(reloaded.workflowId()).isEqualTo(expected.workflowId());
        assertThat(reloaded.snapshotId()).isEqualTo(expected.snapshotId());
        assertThat(reloaded.authorityRevision()).isEqualTo(1L);
        assertThat(reloaded.authorityType()).isEqualTo(AnalysisReportV2Record.AUTHORITY_TYPE);
        assertThat(reloaded.strategyDefaultsVersion())
                .isEqualTo(StrategyParameterDefaultsService.V2_DEFAULTS_VERSION);
        assertThat(reloaded.engineType()).isEqualTo("OPENAI_COMPATIBLE");
        assertThat(reloaded.strategyParameters()).isEqualTo(expected.strategyParameters());
        assertThat(reloaded.providerKey()).isEqualTo("mock-provider");
        assertThat(reloaded.modelId()).isEqualTo("mock-model");
        assertThat(reloaded.promptVersion()).isEqualTo("prompt-v2");
        assertThat(reloaded.safetyStatus()).isEqualTo("PASSED");
        assertThat(reloaded.probabilityAnalysis()).singleElement()
                .extracting(ProbabilityInsightResponse::rationale)
                .isEqualTo("Structured v2 probability analysis.");
        assertThat(reloaded.riskWarnings()).singleElement()
                .extracting(RiskWarningResponse::message)
                .isEqualTo("Odds can change before kickoff.");
        assertThat(reloaded.simulatedSelections()).singleElement()
                .satisfies(selection -> {
                    assertThat(selection.selection()).isEqualTo("HOME_WIN");
                    assertThat(selection.stakeAmount()).isEqualByComparingTo("10.00");
                });
        assertThat(reloaded.llmOutput().path("summary").asText())
                .isEqualTo("Structured v2 repository output.");
    }

    private record V2LineageFixture(String workflowId, String snapshotId) {
    }
}
