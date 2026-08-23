package org.footballlab.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

class Stage9PrivacyDatabaseAuditTest {

    private static final String DATABASE_URL_PROPERTY = "stage9.db.url";
    private static final String RAW_SENTINEL_PROPERTY = "stage9.privacy.rawSentinel";
    private static final String ORIGINAL_FILE_NAME_PROPERTY = "stage9.privacy.originalFileName";

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

    private static final Set<String> REQUIRED_EXPLICIT_TABLES = Set.of(
            "workflow_operation",
            "llm_invocation_audit",
            "ocr_confirmed_snapshot",
            "analysis_report",
            "simulated_plan",
            "simulated_plan_item");

    private static final Set<ColumnRef> REQUIRED_PAYLOAD_COLUMNS = Set.of(
            new ColumnRef("screenshot_task", "payload_json"),
            new ColumnRef("ocr_task", "payload_json"),
            new ColumnRef("ocr_confirmed_snapshot", "payload_json"),
            new ColumnRef("analysis_report", "payload_json"),
            new ColumnRef("simulated_plan", "payload_json"),
            new ColumnRef("simulated_plan_item", "payload_json"),
            new ColumnRef("public_result_snapshot", "payload_json"),
            new ColumnRef("review_record", "payload_json"));

    private static final Set<Integer> CHARACTER_SQL_TYPES = Set.of(
            Types.CHAR,
            Types.VARCHAR,
            Types.LONGVARCHAR,
            Types.NCHAR,
            Types.NVARCHAR,
            Types.LONGNVARCHAR,
            Types.CLOB,
            Types.NCLOB);

    @Test
    void shouldNotPersistStage9PrivateOcrEvidence() throws Exception {
        String databaseUrl = System.getProperty(DATABASE_URL_PROPERTY, "");
        assumeTrue(!databaseUrl.isBlank(), DATABASE_URL_PROPERTY + " was not supplied");

        String rawSentinel = requireNonBlankProperty(RAW_SENTINEL_PROPERTY);
        String originalFileName = requireNonBlankProperty(ORIGINAL_FILE_NAME_PROPERTY);
        Set<String> sensitiveVariants = sensitiveVariants(rawSentinel, originalFileName);

        try (Connection connection = DriverManager.getConnection(databaseUrl, "sa", "")) {
            Map<String, TableRef> tables = readCoreTables(connection);
            assertEquals(CORE_TABLES, tables.keySet(), "Stage 9 privacy audit core-table coverage mismatch");

            Set<ColumnRef> scannedColumns = new LinkedHashSet<>();
            Map<ColumnRef, Long> findings = new LinkedHashMap<>();

            for (String tableName : CORE_TABLES) {
                TableRef table = tables.get(tableName);
                List<DatabaseColumn> characterColumns = readCharacterColumns(connection, table);
                assertFalse(
                        characterColumns.isEmpty(),
                        () -> "Stage 9 privacy audit found no character columns for " + tableName);

                for (DatabaseColumn column : characterColumns) {
                    ColumnRef columnRef = new ColumnRef(tableName, column.name().toLowerCase(Locale.ROOT));
                    scannedColumns.add(columnRef);
                    long matchingRowCount = countMatchingRows(connection, table, column, sensitiveVariants);
                    if (matchingRowCount > 0) {
                        findings.put(columnRef, matchingRowCount);
                    }
                }
            }

            Set<String> scannedTables = scannedColumns.stream()
                    .map(ColumnRef::table)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            assertTrue(
                    scannedTables.containsAll(REQUIRED_EXPLICIT_TABLES),
                    "Stage 9 privacy audit missed a required operation/audit/authority table");

            Set<ColumnRef> scannedPayloadColumns = scannedColumns.stream()
                    .filter(column -> "payload_json".equals(column.column()))
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            assertEquals(
                    REQUIRED_PAYLOAD_COLUMNS,
                    scannedPayloadColumns,
                    "Stage 9 privacy audit must cover all eight payload_json columns");

            long rawTextNonNullCount = countNonNullRows(
                    connection,
                    tables.get("ocr_task"),
                    "raw_text");
            assertEquals(
                    0L,
                    rawTextNonNullCount,
                    () -> formatFinding(new ColumnRef("ocr_task", "raw_text"), rawTextNonNullCount));

            assertTrue(
                    findings.isEmpty(),
                    () -> "Stage 9 privacy database findings: " + formatFindings(findings));
        }
    }

    private String requireNonBlankProperty(String propertyName) {
        String value = System.getProperty(propertyName, "");
        assertFalse(value.isBlank(), propertyName + " must be non-blank when " + DATABASE_URL_PROPERTY + " is supplied");
        return value;
    }

    private Map<String, TableRef> readCoreTables(Connection connection) throws SQLException {
        Map<String, TableRef> tables = new LinkedHashMap<>();
        DatabaseMetaData metadata = connection.getMetaData();
        try (ResultSet resultSet = metadata.getTables(connection.getCatalog(), null, "%", null)) {
            while (resultSet.next()) {
                String actualName = resultSet.getString("TABLE_NAME");
                String normalizedName = actualName.toLowerCase(Locale.ROOT);
                if (CORE_TABLES.contains(normalizedName)) {
                    tables.put(normalizedName, new TableRef(
                            resultSet.getString("TABLE_SCHEM"),
                            actualName));
                }
            }
        }
        return tables;
    }

    private List<DatabaseColumn> readCharacterColumns(Connection connection, TableRef table) throws SQLException {
        List<DatabaseColumn> columns = new ArrayList<>();
        DatabaseMetaData metadata = connection.getMetaData();
        try (ResultSet resultSet = metadata.getColumns(
                connection.getCatalog(),
                table.schema(),
                table.name(),
                "%")) {
            while (resultSet.next()) {
                int sqlType = resultSet.getInt("DATA_TYPE");
                if (CHARACTER_SQL_TYPES.contains(sqlType)) {
                    columns.add(new DatabaseColumn(resultSet.getString("COLUMN_NAME"), sqlType));
                }
            }
        }
        return columns;
    }

    private long countMatchingRows(
            Connection connection,
            TableRef table,
            DatabaseColumn column,
            Set<String> sensitiveVariants) throws SQLException {
        String sql = "select " + quoteIdentifier(connection, column.name())
                + " from " + qualifiedTableName(connection, table)
                + " where " + quoteIdentifier(connection, column.name()) + " is not null";
        long matchingRows = 0;
        try (Statement statement = connection.createStatement();
                ResultSet resultSet = statement.executeQuery(sql)) {
            while (resultSet.next()) {
                String value = resultSet.getString(1);
                if (value != null && containsAny(value, sensitiveVariants)) {
                    matchingRows++;
                }
            }
        }
        return matchingRows;
    }

    private long countNonNullRows(Connection connection, TableRef table, String columnName) throws SQLException {
        String sql = "select count(*) from " + qualifiedTableName(connection, table)
                + " where " + quoteIdentifier(connection, columnName) + " is not null";
        try (Statement statement = connection.createStatement();
                ResultSet resultSet = statement.executeQuery(sql)) {
            resultSet.next();
            return resultSet.getLong(1);
        }
    }

    private boolean containsAny(String value, Set<String> sensitiveVariants) {
        for (String sensitiveVariant : sensitiveVariants) {
            if (value.contains(sensitiveVariant)) {
                return true;
            }
        }
        return false;
    }

    private Set<String> sensitiveVariants(String... tokens) {
        Set<String> variants = new LinkedHashSet<>();
        for (String token : tokens) {
            variants.add(token);

            String formEncoded = URLEncoder.encode(token, StandardCharsets.UTF_8);
            variants.add(formEncoded);
            variants.add(formEncoded.replace("+", "%20"));

            variants.add(jsonEscape(token));
            String base64 = Base64.getEncoder().encodeToString(token.getBytes(StandardCharsets.UTF_8));
            variants.add(base64);
            variants.add(base64.replaceFirst("=+$", ""));
        }
        variants.remove("");
        return variants;
    }

    private String jsonEscape(String value) {
        StringBuilder escaped = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '"' -> escaped.append("\\\"");
                case '\\' -> escaped.append("\\\\");
                case '\b' -> escaped.append("\\b");
                case '\f' -> escaped.append("\\f");
                case '\n' -> escaped.append("\\n");
                case '\r' -> escaped.append("\\r");
                case '\t' -> escaped.append("\\t");
                default -> {
                    if (character < 0x20 || character > 0x7e) {
                        escaped.append(String.format(Locale.ROOT, "\\u%04x", (int) character));
                    } else {
                        escaped.append(character);
                    }
                }
            }
        }
        return escaped.toString();
    }

    private String qualifiedTableName(Connection connection, TableRef table) throws SQLException {
        if (table.schema() == null || table.schema().isBlank()) {
            return quoteIdentifier(connection, table.name());
        }
        return quoteIdentifier(connection, table.schema()) + "." + quoteIdentifier(connection, table.name());
    }

    private String quoteIdentifier(Connection connection, String identifier) throws SQLException {
        String quote = connection.getMetaData().getIdentifierQuoteString().trim();
        if (quote.isEmpty()) {
            return identifier;
        }
        return quote + identifier.replace(quote, quote + quote) + quote;
    }

    private String formatFindings(Map<ColumnRef, Long> findings) {
        return findings.entrySet().stream()
                .map(entry -> formatFinding(entry.getKey(), entry.getValue()))
                .collect(Collectors.joining(", "));
    }

    private String formatFinding(ColumnRef column, long count) {
        return column.table() + "." + column.column() + "=" + count;
    }

    private record TableRef(String schema, String name) {
    }

    private record DatabaseColumn(String name, int sqlType) {
    }

    private record ColumnRef(String table, String column) {
    }
}
