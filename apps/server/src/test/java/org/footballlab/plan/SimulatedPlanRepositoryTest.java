package org.footballlab.plan;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSnapshotResponse;
import org.footballlab.plan.persistence.SimulatedPlanV2Record;
import org.footballlab.plan.repository.SimulatedPlanRepository;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties =
        "spring.datasource.url=jdbc:h2:mem:simulated_plan_repository_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
class SimulatedPlanRepositoryTest {

    private static final String CREATED_AT = "2026-08-23T14:00:00+08:00";
    private static final String UPDATED_AT = "2026-08-23T14:01:00+08:00";

    @Autowired
    private SimulatedPlanRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void shouldRoundTripFourDecimalGeneratedPlanAndTransitionOnlyItsHeader() {
        String suffix = suffix();
        Lineage lineage = insertLineage(suffix);
        SimulatedPlanV2Record generated = v2Plan(lineage, "plan-v2-" + suffix, "item-v2-" + suffix,
                "WIN_DRAW_LOSS", "HOME_WIN", new BigDecimal("2.1234"));

        repository.insertGeneratedPlan(generated);

        assertThat(repository.findV2ById(generated.planId())).contains(generated);
        assertThat(repository.findV2ByReportId(generated.reportId())).contains(generated);
        Map<String, Object> before = itemRow(generated.planId());
        String rawPayloadBefore = itemPayload(generated.planId());

        assertThat(repository.transitionToPendingResult(generated.planId(), "等待公开赛果。", UPDATED_AT)).isTrue();
        assertThat(repository.transitionToPendingResult(generated.planId(), "重复保存。", UPDATED_AT)).isFalse();

        SimulatedPlanV2Record pending = repository.findV2ById(generated.planId()).orElseThrow();
        assertThat(pending.planStatus()).isEqualTo("PENDING_RESULT");
        assertThat(pending.statusFlow()).containsExactly("GENERATED", "SAVED", "PENDING_RESULT");
        assertThat(pending.snapshot().snapshotStatus()).isEqualTo("PENDING_RESULT");
        assertThat(pending.operatorNote()).isEqualTo("等待公开赛果。");
        assertThat(pending.items()).containsExactlyElementsOf(generated.items());

        Map<String, Object> after = itemRow(generated.planId());
        assertThat(after).containsAllEntriesOf(before);
        assertThat((BigDecimal) after.get("odds")).isEqualByComparingTo((BigDecimal) before.get("odds"));
        assertThat((BigDecimal) after.get("stake_amount"))
                .isEqualByComparingTo((BigDecimal) before.get("stake_amount"));
        assertThat(itemPayload(generated.planId())).isEqualTo(rawPayloadBefore);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from simulated_plan_item where plan_id = ?",
                Integer.class,
                generated.planId())).isEqualTo(1);
    }

    @Test
    void legacySaveTransitionMustIgnoreCallerItemChangesAndKeepOriginalRows() {
        String suffix = suffix();
        SimulatedPlanResponse generated = legacyPlan(
                "legacy-plan-" + suffix,
                "legacy-item-" + suffix,
                "WIN_DRAW_LOSS",
                "DRAW",
                "GENERATED");
        repository.savePlan(generated);
        Map<String, Object> before = itemRow(generated.planId());
        String rawPayloadBefore = itemPayload(generated.planId());

        SimulatedPlanItemResponse forged = new SimulatedPlanItemResponse(
                generated.items().get(0).planItemId(),
                "forged-match",
                "2099-01-01",
                "Forged League",
                "Forged Home",
                "Forged Away",
                "2099-01-01T00:00:00Z",
                "HANDICAP_WIN_DRAW_LOSS",
                "AWAY_WIN",
                new BigDecimal("99.9999"),
                new BigDecimal("99.99"),
                "PENDING_RESULT",
                "forged");
        SimulatedPlanResponse callerPending = copyLegacyPending(generated, forged);

        repository.savePlan(callerPending);

        Map<String, Object> after = itemRow(generated.planId());
        assertThat(after).containsAllEntriesOf(before);
        assertThat(itemPayload(generated.planId())).isEqualTo(rawPayloadBefore);
        SimulatedPlanResponse stored = repository.findPlan(generated.planId()).orElseThrow();
        assertThat(stored.planStatus()).isEqualTo("PENDING_RESULT");
        assertThat(stored.items()).containsExactly(generated.items().get(0));
        assertThat(repository.listSavedPlans()).extracting(SimulatedPlanResponse::planId).contains(generated.planId());
        assertThat(repository.nextPlanSequence()).isPositive();
        assertThat(repository.nextPlanItemSequence()).isPositive();
    }

    private Lineage insertLineage(String suffix) {
        String workflowId = "workflow-plan-" + suffix;
        String screenshotId = "shot-plan-" + suffix;
        String ocrId = "ocr-plan-" + suffix;
        String snapshotId = "snapshot-plan-" + suffix;
        String reportId = "report-plan-" + suffix;
        jdbcTemplate.update("insert into ocr_workflow (workflow_id,current_stage,version,created_at,updated_at) values (?,'ANALYSIS_GENERATED',1,?,?)",
                workflowId, CREATED_AT, CREATED_AT);
        jdbcTemplate.update("insert into screenshot_task (task_id,file_name,content_type,file_size,sample_label,status,server_ocr_enabled,privacy_policy,created_at,workflow_id) values (?,'fixture.png','image/png',1,'FICTIONAL_SAMPLE','CREATED',false,'LOCAL_ONLY',?,?)",
                screenshotId, CREATED_AT, workflowId);
        jdbcTemplate.update("insert into ocr_task (ocr_task_id,screenshot_task_id,ocr_provider,status,analysis_allowed,parsed_at,workflow_id) values (?,?,'LOCAL_BROWSER','PARSED',true,?,?)",
                ocrId, screenshotId, CREATED_AT, workflowId);
        jdbcTemplate.update("insert into ocr_confirmed_snapshot (snapshot_id,ocr_task_id,source_type,snapshot_status,analysis_allowed,confirmed_at,workflow_id,confirmed_revision) values (?,?,'USER_SCREENSHOT_CONFIRMED','CONFIRMED',true,?,?,1)",
                snapshotId, ocrId, CREATED_AT, workflowId);
        jdbcTemplate.update("insert into analysis_report (report_id,snapshot_id,input_source_type,engine_type,report_status,probability_analysis_json,risk_warnings_json,simulated_selections_json,compliance_notice,payload_json,generated_at,workflow_id,authority_type,provenance_json,schema_version,authority_snapshot_id,authority_revision,strategy_defaults_version) values (?,?,'USER_SCREENSHOT_CONFIRMED','MOCK_RULE_ENGINE','GENERATED','[]','[]','[]','For research only.','{}',?,?,'SERVER_GENERATED_ANALYSIS_V2','{}','ANALYSIS_REPORT_V2',?,1,'STRATEGY_DEFAULTS_V2')",
                reportId, snapshotId, CREATED_AT, workflowId, snapshotId);
        return new Lineage(workflowId, reportId, snapshotId);
    }

    private SimulatedPlanV2Record v2Plan(
            Lineage lineage,
            String planId,
            String itemId,
            String playType,
            String selection,
            BigDecimal odds) {
        StrategyParameterRequest strategy = v2Strategy(new BigDecimal("30.00"));
        SimulatedPlanItemResponse item = new SimulatedPlanItemResponse(
                itemId, "match-001", "2026-08-24", "Fictional League", "Alpha FC", "Beta FC",
                "2026-08-24T19:30:00+08:00", playType, selection, odds, new BigDecimal("10.00"),
                "GENERATED", "Generated by server.");
        SimulatedPlanSnapshotResponse snapshot = new SimulatedPlanSnapshotResponse(
                "plan-snapshot-" + planId, lineage.snapshotId(), lineage.reportId(),
                "USER_SCREENSHOT_CONFIRMED", "MOCK_RULE_ENGINE", "GENERATED", strategy, 1,
                "GENERATED", CREATED_AT);
        return new SimulatedPlanV2Record(
                lineage.workflowId(), SimulatedPlanV2Record.AUTHORITY_TYPE, planId, "SIMULATED_ONLY",
                "GENERATED", lineage.reportId(), lineage.snapshotId(), "CNY", new BigDecimal("30.00"),
                strategy, List.of("GENERATED"), List.of(item), snapshot, "For research only.", null,
                CREATED_AT, CREATED_AT);
    }

    private SimulatedPlanResponse legacyPlan(
            String planId,
            String itemId,
            String playType,
            String selection,
            String status) {
        StrategyParameterRequest strategy = legacyStrategy(new BigDecimal("20.00"),
                List.of("WIN_DRAW_LOSS", "HANDICAP_WIN_DRAW_LOSS"));
        SimulatedPlanItemResponse item = new SimulatedPlanItemResponse(
                itemId, "legacy-match", "2026-08-24", "Legacy League", "Home", "Away",
                "2026-08-24T20:00:00+08:00", playType, selection, new BigDecimal("2.0500"),
                new BigDecimal("10.00"), "GENERATED", "legacy");
        SimulatedPlanSnapshotResponse snapshot = new SimulatedPlanSnapshotResponse(
                "legacy-plan-snapshot-" + planId, "legacy-snapshot-" + planId, "legacy-report-" + planId,
                "USER_SCREENSHOT_CONFIRMED", "MOCK_RULE_ENGINE", "GENERATED", strategy, 1,
                status, CREATED_AT);
        return new SimulatedPlanResponse(
                planId, "SIMULATED_ONLY", status, snapshot.reportId(), snapshot.snapshotId(), "CNY",
                new BigDecimal("20.00"), strategy, List.of(status), List.of(item), snapshot,
                "Legacy research plan.", null, CREATED_AT, CREATED_AT);
    }

    private SimulatedPlanResponse copyLegacyPending(
            SimulatedPlanResponse generated,
            SimulatedPlanItemResponse callerItem) {
        SimulatedPlanSnapshotResponse snapshot = generated.snapshot();
        return new SimulatedPlanResponse(
                generated.planId(), generated.planType(), "PENDING_RESULT", generated.reportId(),
                generated.snapshotId(), generated.currency(), generated.budgetAmount(),
                generated.strategyParameters(), List.of("GENERATED", "SAVED", "PENDING_RESULT"),
                List.of(callerItem), new SimulatedPlanSnapshotResponse(
                        snapshot.planSnapshotId(), snapshot.snapshotId(), snapshot.reportId(),
                        snapshot.inputSourceType(), snapshot.engineType(), snapshot.sourceReportStatus(),
                        snapshot.strategyParameters(), snapshot.selectionCount(), "PENDING_RESULT",
                        snapshot.capturedAt()), generated.complianceNotice(), "save", generated.createdAt(), UPDATED_AT);
    }

    private StrategyParameterRequest v2Strategy(BigDecimal budget) {
        return new StrategyParameterRequest(
                budget, "CNY", 5, 5, 6, "BALANCED", new BigDecimal("0.60"),
                new BigDecimal("0.30"), new BigDecimal("0.10"), true, new BigDecimal("2.00"), 4,
                List.of("WIN_DRAW_LOSS"), List.of(), "DISABLED", null, false, "BALANCED");
    }

    private StrategyParameterRequest legacyStrategy(BigDecimal budget, List<String> playTypes) {
        return new StrategyParameterRequest(
                budget, "CNY", 5, 5, 6, "BALANCED", new BigDecimal("0.60"),
                new BigDecimal("0.30"), new BigDecimal("0.10"), true, new BigDecimal("2.00"), 4,
                playTypes, List.of(), "ENTERTAINMENT_ONLY", null, false, "BALANCED");
    }

    private Map<String, Object> itemRow(String planId) {
        return jdbcTemplate.queryForMap(
                "select plan_item_id,plan_id,match_id,play_type,selection,odds,stake_amount,item_status from simulated_plan_item where plan_id = ?",
                planId);
    }

    private String itemPayload(String planId) {
        return jdbcTemplate.queryForObject(
                "select payload_json from simulated_plan_item where plan_id = ?", String.class, planId);
    }

    private String suffix() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private record Lineage(String workflowId, String reportId, String snapshotId) {
    }
}
