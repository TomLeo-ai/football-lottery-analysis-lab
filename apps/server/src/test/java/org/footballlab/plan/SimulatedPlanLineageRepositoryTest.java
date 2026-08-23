package org.footballlab.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSnapshotResponse;
import org.footballlab.plan.persistence.SimulatedPlanPayloadV2;
import org.footballlab.plan.persistence.SimulatedPlanV2Record;
import org.footballlab.plan.repository.SimulatedPlanRepository;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

@SpringBootTest
class SimulatedPlanLineageRepositoryTest {

    private static final String TIMESTAMP = "2026-08-23T15:00:00+08:00";
    private static final String INTEGRITY_ERROR = "Simulated plan v2 integrity check failed.";

    @Autowired
    private SimulatedPlanRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldFailClosedWhenHeaderOrItemProjectionSplitsFromV2Payload() {
        Lineage headerLineage = insertLineage(suffix());
        SimulatedPlanV2Record headerPlan = v2Plan(headerLineage, "header");
        repository.insertGeneratedPlan(headerPlan);
        jdbcTemplate.update("update simulated_plan set budget_amount = 99.00 where plan_id = ?", headerPlan.planId());

        assertThatThrownBy(() -> repository.findV2ById(headerPlan.planId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage(INTEGRITY_ERROR);

        Lineage itemLineage = insertLineage(suffix());
        SimulatedPlanV2Record itemPlan = v2Plan(itemLineage, "item");
        repository.insertGeneratedPlan(itemPlan);
        jdbcTemplate.update(
                "update simulated_plan_item set payload_json = '{}' where plan_id = ?",
                itemPlan.planId());

        assertThatThrownBy(() -> repository.findAnyById(itemPlan.planId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage(INTEGRITY_ERROR);
    }

    @Test
    void databaseMustRejectDuplicateWorkflowReportAndUnrelatedLineage() {
        Lineage first = insertLineage(suffix());
        repository.insertGeneratedPlan(v2Plan(first, "first"));

        assertThatThrownBy(() -> repository.insertGeneratedPlan(v2Plan(first, "duplicate")))
                .isInstanceOf(DataIntegrityViolationException.class);

        Lineage owner = insertLineage(suffix());
        Lineage second = insertLineage(suffix());
        SimulatedPlanV2Record unrelated = copyLineage(
                v2Plan(second, "unrelated"),
                owner.workflowId(),
                second.reportId(),
                second.snapshotId());
        assertThatThrownBy(() -> repository.insertGeneratedPlan(unrelated))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void legacyNormalAndHandicapRowsRemainReadableWithoutV2Upgrade() {
        SimulatedPlanResponse normal = legacyPlan("normal", "WIN_DRAW_LOSS", "HOME_WIN");
        repository.savePlan(normal);
        String normalPayload = payload(normal.planId());

        assertThat(repository.findAnyById(normal.planId())).contains(normal);
        assertThat(repository.findV2ById(normal.planId())).isEmpty();
        assertThat(payload(normal.planId())).isEqualTo(normalPayload);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from simulated_plan where plan_id = ? and workflow_id is null and authority_type is null and schema_version is null",
                Integer.class, normal.planId())).isEqualTo(1);
    }

    @Test
    void checkedInLegacyV1FixtureMustRemainVisibleWithoutPayloadMutation() throws Exception {
        IsolatedLegacyDatabase legacy = loadCheckedInLegacyFixture();
        String planPayloadBefore = legacy.jdbcTemplate().queryForObject(
                "select payload_json from simulated_plan where plan_id = 'plan-legacy-001'", String.class);
        String itemPayloadBefore = legacy.jdbcTemplate().queryForObject(
                "select payload_json from simulated_plan_item where plan_id = 'plan-legacy-001'", String.class);

        SimulatedPlanResponse reloaded = legacy.repository().findAnyById("plan-legacy-001").orElseThrow();

        assertThat(reloaded.planStatus()).isEqualTo("PENDING_RESULT");
        assertThat(reloaded.items()).singleElement().satisfies(item -> {
            assertThat(item.playType()).isEqualTo("HANDICAP_WIN_DRAW_LOSS");
            assertThat(item.selection()).isEqualTo("HOME");
            assertThat(item.itemStatus()).isEqualTo("PENDING");
        });
        assertThat(legacy.repository().findPlan("plan-legacy-001")).contains(reloaded);
        assertThat(legacy.repository().listSavedPlans())
                .extracting(SimulatedPlanResponse::planId)
                .contains("plan-legacy-001");
        assertThat(legacy.repository().findV2ById("plan-legacy-001")).isEmpty();
        assertThat(legacy.repository().findV2ByReportId("report-legacy-001")).isEmpty();
        assertThat(legacy.jdbcTemplate().queryForObject(
                "select plan_status from simulated_plan where plan_id = 'plan-legacy-001'", String.class))
                .isEqualTo("PENDING");
        assertThat(legacy.jdbcTemplate().queryForObject(
                "select payload_json from simulated_plan where plan_id = 'plan-legacy-001'", String.class))
                .isEqualTo(planPayloadBefore);
        assertThat(legacy.jdbcTemplate().queryForObject(
                "select payload_json from simulated_plan_item where plan_id = 'plan-legacy-001'", String.class))
                .isEqualTo(itemPayloadBefore);
    }

    @Test
    void anyV2MarkerMustFailClosedWhenTheMarkerSetIsIncomplete() {
        SimulatedPlanResponse legacy = legacyPlan("marker", "WIN_DRAW_LOSS", "DRAW");
        repository.savePlan(legacy);
        jdbcTemplate.update(
                "update simulated_plan set schema_version = ? where plan_id = ?",
                SimulatedPlanPayloadV2.SCHEMA_VERSION,
                legacy.planId());

        assertThatThrownBy(() -> repository.findAnyById(legacy.planId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage(INTEGRITY_ERROR);
    }

    @Test
    void v2MustRejectNonWinDrawLossItems() {
        Lineage lineage = new Lineage("workflow-validation", "report-validation", "snapshot-validation");

        assertThatThrownBy(() -> v2Plan(lineage, "non-wdl", "HANDICAP_WIN_DRAW_LOSS", "HOME_WIN"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("WIN_DRAW_LOSS");
    }

    private Lineage insertLineage(String suffix) {
        String workflowId = "workflow-lineage-" + suffix;
        String screenshotId = "shot-lineage-" + suffix;
        String ocrId = "ocr-lineage-" + suffix;
        String snapshotId = "snapshot-lineage-" + suffix;
        String reportId = "report-lineage-" + suffix;
        jdbcTemplate.update("insert into ocr_workflow (workflow_id,current_stage,version,created_at,updated_at) values (?,'ANALYSIS_GENERATED',1,?,?)",
                workflowId, TIMESTAMP, TIMESTAMP);
        jdbcTemplate.update("insert into screenshot_task (task_id,file_name,content_type,file_size,sample_label,status,server_ocr_enabled,privacy_policy,created_at,workflow_id) values (?,'fixture.png','image/png',1,'FICTIONAL_SAMPLE','CREATED',false,'LOCAL_ONLY',?,?)",
                screenshotId, TIMESTAMP, workflowId);
        jdbcTemplate.update("insert into ocr_task (ocr_task_id,screenshot_task_id,ocr_provider,status,analysis_allowed,parsed_at,workflow_id) values (?,?,'LOCAL_BROWSER','PARSED',true,?,?)",
                ocrId, screenshotId, TIMESTAMP, workflowId);
        jdbcTemplate.update("insert into ocr_confirmed_snapshot (snapshot_id,ocr_task_id,source_type,snapshot_status,analysis_allowed,confirmed_at,workflow_id,confirmed_revision) values (?,?,'USER_SCREENSHOT_CONFIRMED','CONFIRMED',true,?,?,1)",
                snapshotId, ocrId, TIMESTAMP, workflowId);
        jdbcTemplate.update("insert into analysis_report (report_id,snapshot_id,input_source_type,engine_type,report_status,probability_analysis_json,risk_warnings_json,simulated_selections_json,compliance_notice,payload_json,generated_at,workflow_id,authority_type,provenance_json,schema_version,authority_snapshot_id,authority_revision,strategy_defaults_version) values (?,?,'USER_SCREENSHOT_CONFIRMED','MOCK_RULE_ENGINE','GENERATED','[]','[]','[]','For research only.','{}',?,?,'SERVER_GENERATED_ANALYSIS_V2','{}','ANALYSIS_REPORT_V2',?,1,'STRATEGY_DEFAULTS_V2')",
                reportId, snapshotId, TIMESTAMP, workflowId, snapshotId);
        return new Lineage(workflowId, reportId, snapshotId);
    }

    private SimulatedPlanV2Record v2Plan(Lineage lineage, String label) {
        return v2Plan(lineage, label, "WIN_DRAW_LOSS", "HOME_WIN");
    }

    private SimulatedPlanV2Record v2Plan(
            Lineage lineage,
            String label,
            String playType,
            String selection) {
        String unique = suffix();
        StrategyParameterRequest strategy = v2Strategy(new BigDecimal("30.00"));
        SimulatedPlanItemResponse item = new SimulatedPlanItemResponse(
                "item-" + label + "-" + unique, "match-" + label, "2026-08-24", "Fictional League",
                "Home", "Away", "2026-08-24T20:00:00+08:00", playType, selection,
                new BigDecimal("2.1234"), new BigDecimal("10.00"), "GENERATED", "server item");
        SimulatedPlanSnapshotResponse snapshot = new SimulatedPlanSnapshotResponse(
                "plan-snapshot-" + label + "-" + unique, lineage.snapshotId(), lineage.reportId(),
                "USER_SCREENSHOT_CONFIRMED", "MOCK_RULE_ENGINE", "GENERATED", strategy, 1,
                "GENERATED", TIMESTAMP);
        return new SimulatedPlanV2Record(
                lineage.workflowId(), SimulatedPlanV2Record.AUTHORITY_TYPE, "plan-" + label + "-" + unique,
                "SIMULATED_ONLY", "GENERATED", lineage.reportId(), lineage.snapshotId(), "CNY",
                new BigDecimal("30.00"), strategy, List.of("GENERATED"), List.of(item), snapshot,
                "For research only.", null, TIMESTAMP, TIMESTAMP);
    }

    private SimulatedPlanV2Record copyLineage(
            SimulatedPlanV2Record source,
            String workflowId,
            String reportId,
            String snapshotId) {
        SimulatedPlanSnapshotResponse snapshot = source.snapshot();
        return new SimulatedPlanV2Record(
                workflowId, source.authorityType(), source.planId(), source.planType(), source.planStatus(),
                reportId, snapshotId, source.currency(), source.budgetAmount(), source.strategyParameters(),
                source.statusFlow(), source.items(), new SimulatedPlanSnapshotResponse(
                        snapshot.planSnapshotId(), snapshotId, reportId, snapshot.inputSourceType(),
                        snapshot.engineType(), snapshot.sourceReportStatus(), snapshot.strategyParameters(),
                        snapshot.selectionCount(), snapshot.snapshotStatus(), snapshot.capturedAt()),
                source.complianceNotice(), source.operatorNote(), source.createdAt(), source.updatedAt());
    }

    private SimulatedPlanResponse legacyPlan(String label, String playType, String selection) {
        String unique = suffix();
        String planId = "legacy-" + label + "-" + unique;
        StrategyParameterRequest strategy = legacyStrategy(
                new BigDecimal("20.00"),
                List.of("WIN_DRAW_LOSS", "HANDICAP_WIN_DRAW_LOSS"));
        SimulatedPlanItemResponse item = new SimulatedPlanItemResponse(
                "legacy-item-" + unique, "legacy-match-" + unique, "2026-08-24", "Legacy League",
                "Home", "Away", "2026-08-24T20:00:00+08:00", playType, selection,
                new BigDecimal("2.0500"), new BigDecimal("10.00"), "GENERATED", "legacy item");
        SimulatedPlanSnapshotResponse snapshot = new SimulatedPlanSnapshotResponse(
                "legacy-plan-snapshot-" + unique, "legacy-snapshot-" + unique, "legacy-report-" + unique,
                "USER_SCREENSHOT_CONFIRMED", "MOCK_RULE_ENGINE", "GENERATED", strategy, 1,
                "GENERATED", TIMESTAMP);
        return new SimulatedPlanResponse(
                planId, "SIMULATED_ONLY", "GENERATED", snapshot.reportId(), snapshot.snapshotId(), "CNY",
                new BigDecimal("20.00"), strategy, List.of("GENERATED"), List.of(item), snapshot,
                "Legacy research plan.", null, TIMESTAMP, TIMESTAMP);
    }

    private IsolatedLegacyDatabase loadCheckedInLegacyFixture() throws Exception {
        String url = "jdbc:h2:mem:legacy-plan-" + suffix()
                + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        Flyway.configure()
                .dataSource(url, "sa", "")
                .locations("classpath:db/migration")
                .target("2")
                .load()
                .migrate();
        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            ScriptUtils.executeSqlScript(
                    connection,
                    new ClassPathResource("fixtures/v1-v2-legacy-workflow.sql"));
        }
        Flyway.configure()
                .dataSource(url, "sa", "")
                .locations("classpath:db/migration")
                .target("5")
                .load()
                .migrate();
        DriverManagerDataSource dataSource = new DriverManagerDataSource(url, "sa", "");
        JdbcTemplate isolatedJdbcTemplate = new JdbcTemplate(dataSource);
        return new IsolatedLegacyDatabase(
                isolatedJdbcTemplate,
                new org.footballlab.plan.repository.JdbcSimulatedPlanRepository(
                        isolatedJdbcTemplate,
                        objectMapper));
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

    private String payload(String planId) {
        return jdbcTemplate.queryForObject(
                "select payload_json from simulated_plan where plan_id = ?", String.class, planId);
    }

    private String suffix() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private record Lineage(String workflowId, String reportId, String snapshotId) {
    }

    private record IsolatedLegacyDatabase(
            JdbcTemplate jdbcTemplate,
            SimulatedPlanRepository repository) {
    }
}
