package org.footballlab.plan;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.function.UnaryOperator;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.RiskWarningResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.analysis.persistence.AnalysisReportV2Record;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.springframework.jdbc.core.JdbcTemplate;

final class AuthoritativePlanTestFixture {

    static final String NOW = "2026-08-24T10:00:00+08:00";

    private AuthoritativePlanTestFixture() {
    }

    static Fixture insert(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            AnalysisReportRepository reportRepository) throws Exception {
        return insert(jdbcTemplate, objectMapper, reportRepository, UnaryOperator.identity());
    }

    static Fixture insert(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            AnalysisReportRepository reportRepository,
            UnaryOperator<AnalysisReportV2Record> reportMutation) throws Exception {
        String suffix = UUID.randomUUID().toString();
        String workflowId = "workflow-plan-" + suffix;
        String screenshotTaskId = "shot-plan-" + suffix;
        String ocrTaskId = "ocr-plan-" + suffix;
        String snapshotId = "snapshot-plan-" + suffix;
        String reportId = "analysis-plan-" + suffix;
        String matchId = "match-plan-" + suffix;
        String marketId = "market-plan-" + suffix;

        List<ConfirmedMatchResponse> matches = List.of(new ConfirmedMatchResponse(
                matchId,
                "2026-08-25",
                "Authoritative League",
                "Database North",
                "Database South",
                "2026-08-25T19:30:00+08:00"));
        List<ConfirmedMarketResponse> markets = List.of(new ConfirmedMarketResponse(
                marketId,
                matchId,
                "WIN_DRAW_LOSS",
                "HOME_WIN",
                new BigDecimal("2.1500")));

        jdbcTemplate.update("""
                        insert into ocr_workflow (
                            workflow_id, current_stage, version, current_ocr_task_id,
                            confirmed_snapshot_id, current_report_id, current_plan_id,
                            created_at, updated_at
                        ) values (?, 'ANALYSIS_GENERATED', 4, ?, ?, ?, null, ?, ?)
                        """,
                workflowId, ocrTaskId, snapshotId, reportId, NOW, NOW);
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

        StrategyParameterRequest strategy = strategy();
        AnalysisReportV2Record report = new AnalysisReportV2Record(
                workflowId,
                reportId,
                snapshotId,
                7,
                AnalysisReportV2Record.AUTHORITY_TYPE,
                "USER_SCREENSHOT_CONFIRMED",
                "MOCK_RULE_ENGINE",
                "GENERATED",
                strategy,
                "STRATEGY_DEFAULTS_V2",
                List.of(new ProbabilityInsightResponse(
                        matchId,
                        "2026-08-25",
                        "Authoritative League",
                        "2026-08-25T19:30:00+08:00",
                        "Database North",
                        "Database South",
                        "HOME_WIN",
                        "MEDIUM",
                        "Persisted probability rationale.")),
                List.of(new RiskWarningResponse("INFO_RISK", "MEDIUM", "Persisted risk warning.")),
                List.of(new SimulatedSelectionResponse(
                        matchId,
                        "WIN_DRAW_LOSS",
                        "HOME_WIN",
                        new BigDecimal("2.1500"),
                        new BigDecimal("12.50"),
                        "Persisted server selection.")),
                "For research only.",
                NOW,
                null,
                null,
                null,
                "PASSED",
                null,
                null);
        reportRepository.insertV2(reportMutation.apply(report));
        return new Fixture(workflowId, snapshotId, reportId, matchId, marketId, strategy);
    }

    static StrategyParameterRequest strategy() {
        return new StrategyParameterRequest(
                new BigDecimal("36.50"),
                "CNY",
                1,
                1,
                1,
                "BALANCED",
                new BigDecimal("0.60"),
                new BigDecimal("0.30"),
                new BigDecimal("0.10"),
                true,
                new BigDecimal("2.00"),
                1,
                List.of("WIN_DRAW_LOSS"),
                List.of(),
                "DISABLED",
                null,
                false,
                "BALANCED");
    }

    static AnalysisReportV2Record copyReport(
            AnalysisReportV2Record source,
            String reportStatus,
            String safetyStatus,
            List<SimulatedSelectionResponse> selections) {
        return new AnalysisReportV2Record(
                source.workflowId(),
                source.reportId(),
                source.snapshotId(),
                source.authorityRevision(),
                source.authorityType(),
                source.inputSourceType(),
                source.engineType(),
                reportStatus,
                source.strategyParameters(),
                source.strategyDefaultsVersion(),
                source.probabilityAnalysis(),
                source.riskWarnings(),
                selections,
                source.complianceNotice(),
                source.generatedAt(),
                source.providerKey(),
                source.modelId(),
                source.promptVersion(),
                safetyStatus,
                source.llmAuditId(),
                source.llmOutput());
    }

    static String idempotencyKey() {
        return UUID.randomUUID().toString();
    }

    record Fixture(
            String workflowId,
            String snapshotId,
            String reportId,
            String matchId,
            String marketId,
            StrategyParameterRequest strategy) {
    }
}
