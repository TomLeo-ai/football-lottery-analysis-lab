package org.footballlab.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

class V3LegacyMigrationTest {

    @TempDir
    private Path tempDir;

    @Test
    void migratesLegacyRowsToV3WithoutBackfillOrPayloadDrift() throws Exception {
        String url = migrateV2FixtureToV3();

        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            assertThat(currentFlywayVersion(url)).isEqualTo("3");
            assertThat(readTableNames(connection))
                    .contains("ocr_workflow", "workflow_operation", "ocr_review_draft");
            assertThat(readColumnNames(connection, "ocr_confirmed_snapshot"))
                    .contains("workflow_id", "confirmed_revision", "authority_type", "provenance_json", "schema_version");
            assertThat(readColumnNames(connection, "simulated_plan_item")).contains("odds");

            assertThat(queryString(
                    connection,
                    "select workflow_id from screenshot_task where task_id = ?",
                    "screenshot-legacy-001"))
                    .isNull();
            assertThat(queryString(
                    connection,
                    "select workflow_id from ocr_task where ocr_task_id = ?",
                    "ocr-legacy-001"))
                    .isNull();
            assertThat(queryString(
                    connection,
                    "select workflow_id from ocr_confirmed_snapshot where snapshot_id = ?",
                    "snapshot-legacy-001"))
                    .isNull();

            assertThat(queryInt(connection, "select count(*) from analysis_report where report_id = ?", "report-legacy-orphan"))
                    .isEqualTo(1);
            assertThat(queryString(connection, "select payload_json from simulated_plan where plan_id = ?", "plan-legacy-001"))
                    .isEqualTo("{\"legacyPayload\":\"plan-byte-identical\"}");
            assertThat(queryString(connection, "select payload_json from review_record where plan_id = ?", "plan-legacy-001"))
                    .isEqualTo("{\"legacyPayload\":\"review-byte-identical\"}");
            assertThat(queryString(connection, "select plan_snapshot_json from simulated_plan where plan_id = ?", "plan-legacy-001"))
                    .contains("HANDICAP_WIN_DRAW_LOSS");
        }
    }

    @Test
    void enforcesV3WorkflowLineageAndPreservesFourDecimalOdds() throws Exception {
        String url = migrateEmptyDatabaseToV3();

        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            insertWorkflowLineage(connection, "workflow-v3-001", "screenshot-v3-001", "ocr-v3-001",
                    "snapshot-v3-001", "report-v3-001", "plan-v3-001", 0L);

            insertPlanItem(connection, "item-v3-001", "plan-v3-001", "2.3456");
            BigDecimal odds = queryDecimal(
                    connection,
                    "select odds from simulated_plan_item where plan_item_id = ?",
                    "item-v3-001");
            assertThat(odds).isEqualByComparingTo("2.3456");
            assertThat(odds.toPlainString()).isEqualTo("2.3456");

            assertThatThrownBy(() -> insertSnapshot(
                    connection,
                    "snapshot-v3-duplicate",
                    "ocr-v3-001",
                    "workflow-v3-001",
                    1L))
                    .isInstanceOf(SQLException.class);

            execute(
                    connection,
                    """
                            insert into ocr_workflow (
                                workflow_id, current_stage, version, created_at, updated_at
                            ) values (?, 'WAITING_USER_CONFIRMATION', 0, ?, ?)
                            """,
                    "workflow-v3-002",
                    "2026-08-22T01:00:00Z",
                    "2026-08-22T01:00:00Z");

            assertThatThrownBy(() -> insertAnalysisReport(
                    connection,
                    "report-v3-wrong-snapshot",
                    "snapshot-v3-001",
                    "workflow-v3-002"))
                    .isInstanceOf(SQLException.class);

            assertThatThrownBy(() -> insertSimulatedPlan(
                    connection,
                    "plan-v3-wrong-report",
                    "report-v3-001",
                    "snapshot-v3-001",
                    "workflow-v3-002"))
                    .isInstanceOf(SQLException.class);
        }
    }

    private String migrateV2FixtureToV3() throws SQLException {
        String url = h2Url("legacy-upgrade");
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
                .load()
                .migrate();
        return url;
    }

    private String migrateEmptyDatabaseToV3() {
        String url = h2Url("empty-v3");
        Flyway.configure()
                .dataSource(url, "sa", "")
                .locations("classpath:db/migration")
                .load()
                .migrate();
        return url;
    }

    private String currentFlywayVersion(String url) {
        Flyway flyway = Flyway.configure()
                .dataSource(url, "sa", "")
                .locations("classpath:db/migration")
                .load();
        return flyway.info().current().getVersion().getVersion();
    }

    private String h2Url(String databaseName) {
        String databasePath = tempDir.resolve(databaseName).toAbsolutePath().toString().replace('\\', '/');
        return "jdbc:h2:file:" + databasePath + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
    }

    private void insertWorkflowLineage(
            Connection connection,
            String workflowId,
            String screenshotTaskId,
            String ocrTaskId,
            String snapshotId,
            String reportId,
            String planId,
            long confirmedRevision
    ) throws SQLException {
        execute(
                connection,
                """
                        insert into ocr_workflow (
                            workflow_id, current_stage, version, current_ocr_task_id,
                            confirmed_snapshot_id, current_report_id, current_plan_id,
                            created_at, updated_at
                        ) values (?, 'CONFIRMED', 1, ?, ?, ?, ?, ?, ?)
                        """,
                workflowId,
                ocrTaskId,
                snapshotId,
                reportId,
                planId,
                "2026-08-22T01:00:00Z",
                "2026-08-22T01:00:00Z");
        execute(
                connection,
                """
                        insert into screenshot_task (
                            task_id, file_name, content_type, file_size, sample_label, status,
                            server_ocr_enabled, privacy_policy, created_at, payload_json,
                            workflow_id, source_declaration, source_policy_version,
                            authority_type, provenance_json, schema_version
                        ) values (?, 'local-image', 'image/png', 1024, 'FICTIONAL_SAMPLE', 'CREATED',
                            false, 'LOCAL_ONLY', ?, '{}', ?, 'FICTIONAL_SAMPLE', 'SOURCE_POLICY_V2',
                            'USER_OWNED_AUTHORIZED', '{}', 'SCREENSHOT_TASK_V2')
                        """,
                screenshotTaskId,
                "2026-08-22T01:00:00Z",
                workflowId);
        execute(
                connection,
                """
                        insert into ocr_task (
                            ocr_task_id, screenshot_task_id, ocr_provider, raw_text, status,
                            analysis_allowed, fields_json, payload_json, parsed_at,
                            workflow_id, candidate_schema_version, authority_type, provenance_json
                        ) values (?, ?, 'LOCAL_BROWSER', null, 'PARSED', true, '[]', '{}', ?,
                            ?, 'OCR_CANDIDATE_V2', 'USER_SCREENSHOT_CONFIRMED', '{}')
                        """,
                ocrTaskId,
                screenshotTaskId,
                "2026-08-22T01:01:00Z",
                workflowId);
        insertSnapshot(connection, snapshotId, ocrTaskId, workflowId, confirmedRevision);
        insertAnalysisReport(connection, reportId, snapshotId, workflowId);
        insertSimulatedPlan(connection, planId, reportId, snapshotId, workflowId);
    }

    private void insertSnapshot(
            Connection connection,
            String snapshotId,
            String ocrTaskId,
            String workflowId,
            long confirmedRevision
    ) throws SQLException {
        execute(
                connection,
                """
                        insert into ocr_confirmed_snapshot (
                            snapshot_id, ocr_task_id, source_type, snapshot_status, analysis_allowed,
                            risk_preference, budget_amount, currency, matches_json, markets_json,
                            payload_json, confirmed_at, workflow_id, confirmed_revision,
                            authority_type, provenance_json, schema_version
                        ) values (?, ?, 'USER_SCREENSHOT_CONFIRMED', 'CONFIRMED', true,
                            'BALANCED', 30.00, 'CNY', '[]', '[]', '{}', ?, ?, ?,
                            'SERVER_CONFIRMED_V2', '{}', 'CONFIRMED_SNAPSHOT_V2')
                        """,
                snapshotId,
                ocrTaskId,
                "2026-08-22T01:02:00Z",
                workflowId,
                confirmedRevision);
    }

    private void insertAnalysisReport(
            Connection connection,
            String reportId,
            String snapshotId,
            String workflowId
    ) throws SQLException {
        execute(
                connection,
                """
                        insert into analysis_report (
                            report_id, snapshot_id, input_source_type, engine_type, report_status,
                            probability_analysis_json, risk_warnings_json, simulated_selections_json,
                            compliance_notice, payload_json, generated_at, workflow_id,
                            authority_type, provenance_json, schema_version
                        ) values (?, ?, 'SERVER_CONFIRMED_V2', 'RULE_BASED', 'GENERATED',
                            '{}', '[]', '[]', 'For research only.', '{}', ?, ?,
                            'SERVER_GENERATED_V2', '{}', 'ANALYSIS_REPORT_V2')
                        """,
                reportId,
                snapshotId,
                "2026-08-22T01:03:00Z",
                workflowId);
    }

    private void insertSimulatedPlan(
            Connection connection,
            String planId,
            String reportId,
            String snapshotId,
            String workflowId
    ) throws SQLException {
        execute(
                connection,
                """
                        insert into simulated_plan (
                            plan_id, plan_type, plan_status, report_id, snapshot_id, currency,
                            budget_amount, status_flow_json, plan_snapshot_json, compliance_notice,
                            operator_note, payload_json, created_at, updated_at, workflow_id,
                            authority_type, provenance_json, schema_version
                        ) values (?, 'SINGLE', 'PENDING', ?, ?, 'CNY',
                            30.00, '{}', '{}', 'For research only.', null, '{}', ?, ?, ?,
                            'SERVER_GENERATED_V2', '{}', 'SIMULATED_PLAN_V2')
                        """,
                planId,
                reportId,
                snapshotId,
                "2026-08-22T01:04:00Z",
                "2026-08-22T01:04:00Z",
                workflowId);
    }

    private void insertPlanItem(
            Connection connection,
            String planItemId,
            String planId,
            String odds
    ) throws SQLException {
        execute(
                connection,
                """
                        insert into simulated_plan_item (
                            plan_item_id, plan_id, match_id, match_date, league, home_team, away_team,
                            kickoff_time, play_type, selection, odds, stake_amount, item_status,
                            note, payload_json, created_at
                        ) values (?, ?, 'match-v3-001', '2026-08-22', 'Fictional League',
                            'Alpha FC', 'Beta FC', '2026-08-22T12:00:00Z',
                            'WIN_DRAW_LOSS', 'HOME', ?, 2.00, 'PENDING', null, '{}', ?)
                        """,
                planItemId,
                planId,
                new BigDecimal(odds),
                "2026-08-22T01:05:00Z");
    }

    private void execute(Connection connection, String sql, Object... args) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) {
                statement.setObject(i + 1, args[i]);
            }
            statement.executeUpdate();
        }
    }

    private int queryInt(Connection connection, String sql, Object... args) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) {
                statement.setObject(i + 1, args[i]);
            }
            try (ResultSet resultSet = statement.executeQuery()) {
                resultSet.next();
                return resultSet.getInt(1);
            }
        }
    }

    private String queryString(Connection connection, String sql, Object... args) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) {
                statement.setObject(i + 1, args[i]);
            }
            try (ResultSet resultSet = statement.executeQuery()) {
                resultSet.next();
                return resultSet.getString(1);
            }
        }
    }

    private BigDecimal queryDecimal(Connection connection, String sql, Object... args) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) {
                statement.setObject(i + 1, args[i]);
            }
            try (ResultSet resultSet = statement.executeQuery()) {
                resultSet.next();
                return resultSet.getBigDecimal(1);
            }
        }
    }

    private Set<String> readTableNames(Connection connection) throws SQLException {
        DatabaseMetaData metaData = connection.getMetaData();
        Set<String> tableNames = new LinkedHashSet<>();
        try (ResultSet resultSet = metaData.getTables(null, null, "%", new String[] {"TABLE"})) {
            while (resultSet.next()) {
                tableNames.add(resultSet.getString("TABLE_NAME").toLowerCase(Locale.ROOT));
            }
        }
        return tableNames;
    }

    private Set<String> readColumnNames(Connection connection, String tableName) throws SQLException {
        DatabaseMetaData metaData = connection.getMetaData();
        Set<String> columnNames = new LinkedHashSet<>();
        try (ResultSet resultSet = metaData.getColumns(null, null, tableName, "%")) {
            while (resultSet.next()) {
                columnNames.add(resultSet.getString("COLUMN_NAME").toLowerCase(Locale.ROOT));
            }
        }
        return columnNames;
    }
}
