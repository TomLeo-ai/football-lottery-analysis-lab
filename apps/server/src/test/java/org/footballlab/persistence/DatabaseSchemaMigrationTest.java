package org.footballlab.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;

@SpringBootTest
class DatabaseSchemaMigrationTest {

    private static final Set<String> CORE_TABLES = Set.of(
            "screenshot_task",
            "ocr_task",
            "ocr_confirmed_snapshot",
            "analysis_report",
            "simulated_plan",
            "simulated_plan_item",
            "public_result_snapshot",
            "review_record",
            "llm_invocation_audit",
            "ocr_workflow",
            "workflow_operation",
            "ocr_review_draft");

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private Environment environment;

    @Test
    void shouldUseFileBackedH2AndCreateCoreTablesWithFlyway() throws Exception {
        String dataSourceUrl = environment.getProperty("spring.datasource.url");
        assertThat(dataSourceUrl)
                .startsWith("jdbc:h2:file:")
                .contains("MODE=MySQL")
                .contains("DATABASE_TO_LOWER=TRUE");

        DataSource dataSource = applicationContext.getBean(DataSource.class);
        try (Connection connection = dataSource.getConnection()) {
            assertThat(connection.getMetaData().getURL()).startsWith("jdbc:h2:file:");
            assertThat(readTableNames(connection)).containsAll(CORE_TABLES);
            assertThat(readColumnNames(connection, "simulated_plan"))
                    .contains(
                            "plan_id",
                            "plan_status",
                            "report_id",
                            "snapshot_id",
                            "workflow_id",
                            "budget_amount",
                            "authority_type",
                            "provenance_json",
                            "strategy_parameters_json",
                            "created_at");
            assertThat(readColumnNames(connection, "screenshot_task"))
                    .contains(
                            "workflow_id",
                            "source_declaration",
                            "source_policy_version",
                            "authority_type",
                            "provenance_json",
                            "schema_version");
            assertThat(readColumnNames(connection, "ocr_task"))
                    .contains(
                            "workflow_id",
                            "candidate_schema_version",
                            "authority_type",
                            "provenance_json");
            assertThat(readColumnNames(connection, "ocr_confirmed_snapshot"))
                    .contains(
                            "workflow_id",
                            "confirmed_revision",
                            "authority_type",
                            "provenance_json",
                            "schema_version");
            assertThat(readColumnNames(connection, "ocr_workflow"))
                    .contains(
                            "workflow_id",
                            "current_stage",
                            "version",
                            "current_ocr_task_id",
                            "confirmed_snapshot_id",
                            "current_report_id",
                            "current_plan_id",
                            "active_operation_type",
                            "active_operation_key",
                            "created_at",
                            "updated_at");
            assertThat(readColumnNames(connection, "workflow_operation"))
                    .contains(
                            "idempotency_key",
                            "workflow_id",
                            "operation_type",
                            "request_sha256",
                            "operation_status",
                            "result_type",
                            "result_id",
                            "error_code",
                            "http_status",
                            "created_at",
                            "updated_at");
            assertThat(readColumnNames(connection, "ocr_review_draft"))
                    .contains(
                            "ocr_task_id",
                            "workflow_id",
                            "revision",
                            "draft_status",
                            "matches_json",
                            "markets_json",
                            "schema_version",
                            "updated_at");
            assertThat(readColumnNames(connection, "simulated_plan_item"))
                    .contains("plan_item_id", "plan_id", "match_id", "play_type", "selection", "stake_amount");
            assertThat(readColumnNames(connection, "analysis_report"))
                    .contains(
                            "workflow_id",
                            "authority_type",
                            "provenance_json",
                            "schema_version",
                            "provider_key",
                            "model_id",
                            "prompt_version",
                            "strategy_parameters_json",
                            "safety_status",
                            "llm_audit_id");
            assertThat(readColumnNames(connection, "review_record"))
                    .contains(
                            "review_engine_type",
                            "provider_key",
                            "model_id",
                            "prompt_version",
                            "strategy_parameters_json",
                            "llm_insight_json",
                            "safety_status",
                            "llm_audit_id");
            assertThat(readColumnNames(connection, "llm_invocation_audit"))
                    .contains(
                            "audit_id",
                            "business_type",
                            "business_id",
                            "provider_key",
                            "model_id",
                            "prompt_version",
                            "input_hash",
                            "output_hash",
                            "prompt_tokens",
                            "completion_tokens",
                            "total_tokens",
                            "latency_ms",
                            "safety_status",
                            "error_code",
                            "created_at");
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
