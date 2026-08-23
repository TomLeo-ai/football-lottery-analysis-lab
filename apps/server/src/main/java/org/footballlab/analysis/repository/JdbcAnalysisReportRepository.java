package org.footballlab.analysis.repository;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.RiskWarningResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.analysis.persistence.AnalysisReportPayloadV2;
import org.footballlab.analysis.persistence.AnalysisReportV2Record;
import org.footballlab.analysis.persistence.LegacyAnalysisReportAdapter;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcAnalysisReportRepository implements AnalysisReportRepository {

    private static final String REPORT_PREFIX = "analysis-";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcAnalysisReportRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void save(AnalysisReportResponse report) {
        jdbcTemplate.update("""
                        insert into analysis_report (
                            report_id,
                            snapshot_id,
                            input_source_type,
                            engine_type,
                            report_status,
                            probability_analysis_json,
                            risk_warnings_json,
                            simulated_selections_json,
                            compliance_notice,
                            provider_key,
                            model_id,
                            prompt_version,
                            strategy_parameters_json,
                            safety_status,
                            llm_audit_id,
                            payload_json,
                            generated_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                report.reportId(),
                report.snapshotId(),
                report.inputSourceType(),
                report.engineType(),
                report.reportStatus(),
                toJson(report.probabilityAnalysis()),
                toJson(report.riskWarnings()),
                toJson(report.simulatedSelections()),
                report.complianceNotice(),
                report.providerKey(),
                report.modelId(),
                report.promptVersion(),
                toJson(report.strategyParameters()),
                report.safetyStatus(),
                report.llmAuditId(),
                toJson(report),
                report.generatedAt());
    }

    @Override
    public Optional<AnalysisReportResponse> findById(String reportId) {
        return findAnyById(reportId);
    }

    @Override
    public void insertV2(AnalysisReportV2Record report) {
        jdbcTemplate.update("""
                        insert into analysis_report (
                            report_id,
                            snapshot_id,
                            authority_snapshot_id,
                            authority_revision,
                            input_source_type,
                            engine_type,
                            report_status,
                            probability_analysis_json,
                            risk_warnings_json,
                            simulated_selections_json,
                            compliance_notice,
                            provider_key,
                            model_id,
                            prompt_version,
                            strategy_parameters_json,
                            safety_status,
                            llm_audit_id,
                            payload_json,
                            generated_at,
                            workflow_id,
                            authority_type,
                            provenance_json,
                            schema_version,
                            llm_output_json,
                            strategy_defaults_version
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                report.reportId(),
                report.snapshotId(),
                report.snapshotId(),
                report.authorityRevision(),
                report.inputSourceType(),
                report.engineType(),
                report.reportStatus(),
                toJson(report.probabilityAnalysis()),
                toJson(report.riskWarnings()),
                toJson(report.simulatedSelections()),
                report.complianceNotice(),
                report.providerKey(),
                report.modelId(),
                report.promptVersion(),
                toJson(report.strategyParameters()),
                report.safetyStatus(),
                report.llmAuditId(),
                toJson(report.toPayload()),
                report.generatedAt(),
                report.workflowId(),
                report.authorityType(),
                "{}",
                AnalysisReportPayloadV2.SCHEMA_VERSION,
                toJsonOrNull(report.llmOutput()),
                report.strategyDefaultsVersion());
    }

    @Override
    public Optional<AnalysisReportV2Record> findV2ById(String reportId) {
        List<AnalysisReportV2Record> reports = jdbcTemplate.query("""
                        select report_id,
                               snapshot_id,
                               authority_snapshot_id,
                               authority_revision,
                               input_source_type,
                               engine_type,
                               report_status,
                               probability_analysis_json,
                               risk_warnings_json,
                               simulated_selections_json,
                               compliance_notice,
                               provider_key,
                               model_id,
                               prompt_version,
                               strategy_parameters_json,
                               safety_status,
                               llm_audit_id,
                               payload_json,
                               generated_at,
                               workflow_id,
                               authority_type,
                               schema_version,
                               llm_output_json,
                               strategy_defaults_version
                        from analysis_report
                        where report_id = ?
                          and (
                              schema_version = ?
                              or workflow_id is not null
                              or authority_type is not null
                              or authority_snapshot_id is not null
                              or authority_revision is not null
                              or strategy_defaults_version is not null
                          )
                        """,
                (resultSet, rowNumber) -> mapV2Report(
                        resultSet.getString("workflow_id"),
                        resultSet.getString("report_id"),
                        resultSet.getString("snapshot_id"),
                        resultSet.getString("authority_snapshot_id"),
                        resultSet.getLong("authority_revision"),
                        resultSet.getString("authority_type"),
                        resultSet.getString("input_source_type"),
                        resultSet.getString("engine_type"),
                        resultSet.getString("report_status"),
                        resultSet.getString("strategy_parameters_json"),
                        resultSet.getString("strategy_defaults_version"),
                        resultSet.getString("probability_analysis_json"),
                        resultSet.getString("risk_warnings_json"),
                        resultSet.getString("simulated_selections_json"),
                        resultSet.getString("compliance_notice"),
                        resultSet.getString("generated_at"),
                        resultSet.getString("provider_key"),
                        resultSet.getString("model_id"),
                        resultSet.getString("prompt_version"),
                        resultSet.getString("safety_status"),
                        resultSet.getString("llm_audit_id"),
                        resultSet.getString("llm_output_json"),
                        resultSet.getString("payload_json"),
                        resultSet.getString("schema_version")),
                reportId,
                AnalysisReportPayloadV2.SCHEMA_VERSION);
        return reports.stream().findFirst();
    }

    @Override
    public Optional<AnalysisReportV2Record> findV2ByWorkflowId(String workflowId) {
        List<AnalysisReportV2Record> reports = jdbcTemplate.query("""
                        select report_id,
                               snapshot_id,
                               authority_snapshot_id,
                               authority_revision,
                               input_source_type,
                               engine_type,
                               report_status,
                               probability_analysis_json,
                               risk_warnings_json,
                               simulated_selections_json,
                               compliance_notice,
                               provider_key,
                               model_id,
                               prompt_version,
                               strategy_parameters_json,
                               safety_status,
                               llm_audit_id,
                               payload_json,
                               generated_at,
                               workflow_id,
                               authority_type,
                               schema_version,
                               llm_output_json,
                               strategy_defaults_version
                        from analysis_report
                        where workflow_id = ?
                        """,
                (resultSet, rowNumber) -> mapV2Report(
                        resultSet.getString("workflow_id"),
                        resultSet.getString("report_id"),
                        resultSet.getString("snapshot_id"),
                        resultSet.getString("authority_snapshot_id"),
                        resultSet.getLong("authority_revision"),
                        resultSet.getString("authority_type"),
                        resultSet.getString("input_source_type"),
                        resultSet.getString("engine_type"),
                        resultSet.getString("report_status"),
                        resultSet.getString("strategy_parameters_json"),
                        resultSet.getString("strategy_defaults_version"),
                        resultSet.getString("probability_analysis_json"),
                        resultSet.getString("risk_warnings_json"),
                        resultSet.getString("simulated_selections_json"),
                        resultSet.getString("compliance_notice"),
                        resultSet.getString("generated_at"),
                        resultSet.getString("provider_key"),
                        resultSet.getString("model_id"),
                        resultSet.getString("prompt_version"),
                        resultSet.getString("safety_status"),
                        resultSet.getString("llm_audit_id"),
                        resultSet.getString("llm_output_json"),
                        resultSet.getString("payload_json"),
                        resultSet.getString("schema_version")),
                workflowId);
        return reports.stream().findFirst();
    }

    @Override
    public Optional<AnalysisReportResponse> findAnyById(String reportId) {
        try {
            ReportLookup lookup = jdbcTemplate.queryForObject(
                    """
                            select schema_version,
                                   payload_json,
                                   workflow_id,
                                   authority_type,
                                   authority_snapshot_id,
                                   authority_revision,
                                   strategy_defaults_version
                            from analysis_report
                            where report_id = ?
                            """,
                    (resultSet, rowNumber) -> new ReportLookup(
                            resultSet.getString("schema_version"),
                            resultSet.getString("payload_json"),
                            resultSet.getString("workflow_id"),
                            resultSet.getString("authority_type"),
                            resultSet.getString("authority_snapshot_id"),
                            resultSet.getObject("authority_revision", Long.class),
                            resultSet.getString("strategy_defaults_version")),
                    reportId);
            if (lookup.isV2Candidate()) {
                return findV2ById(reportId).map(AnalysisReportV2Record::toResponse);
            }
            return Optional.of(LegacyAnalysisReportAdapter.adapt(fromJson(lookup.payloadJson())));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    @Override
    public long nextReportSequence() {
        List<String> ids = jdbcTemplate.queryForList(
                "select report_id from analysis_report where report_id like ?",
                String.class,
                REPORT_PREFIX + "%");
        return ids.stream()
                .map(this::parseSequence)
                .flatMap(Optional::stream)
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L) + 1L;
    }

    private Optional<Long> parseSequence(String value) {
        if (value == null || !value.startsWith(REPORT_PREFIX)) {
            return Optional.empty();
        }
        try {
            return Optional.of(Long.parseLong(value.substring(REPORT_PREFIX.length())));
        } catch (NumberFormatException ignored) {
            return Optional.empty();
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize analysis report payload.", exception);
        }
    }

    private String toJsonOrNull(Object value) {
        return value == null ? null : toJson(value);
    }

    private AnalysisReportResponse fromJson(String value) {
        return fromJson(value, AnalysisReportResponse.class);
    }

    private <T> T fromJson(String value, Class<T> type) {
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize analysis report payload.", exception);
        }
    }

    private <T> T fromJsonNullable(String value, Class<T> type) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return fromJson(value, type);
    }

    private <T> List<T> fromRequiredJsonList(
            String value,
            TypeReference<List<T>> typeReference,
            String fieldName) {
        if (value == null || value.isBlank()) {
            throw v2IntegrityFailure(fieldName);
        }
        try {
            List<T> result = objectMapper.readValue(value, typeReference);
            if (result == null) {
                throw v2IntegrityFailure(fieldName);
            }
            return result;
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException(
                    "Failed to deserialize analysis report " + fieldName + " projection.",
                    exception);
        }
    }

    private JsonNode fromJsonNode(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(value);
            return node == null || node.isNull() ? null : node;
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize analysis report LLM output.", exception);
        }
    }

    private AnalysisReportV2Record mapV2Report(
            String workflowId,
            String reportId,
            String legacySnapshotId,
            String authoritySnapshotId,
            long authorityRevision,
            String authorityType,
            String inputSourceType,
            String engineType,
            String reportStatus,
            String strategyParametersJson,
            String strategyDefaultsVersion,
            String probabilityAnalysisJson,
            String riskWarningsJson,
            String simulatedSelectionsJson,
            String complianceNotice,
            String generatedAt,
            String providerKey,
            String modelId,
            String promptVersion,
            String safetyStatus,
            String llmAuditId,
            String llmOutputJson,
            String payloadJson,
            String schemaVersion) {
        AnalysisReportPayloadV2 payload = fromJson(payloadJson, AnalysisReportPayloadV2.class);
        StrategyParameterRequest strategyParameters =
                fromJsonNullable(strategyParametersJson, StrategyParameterRequest.class);
        List<ProbabilityInsightResponse> probabilityAnalysis = fromRequiredJsonList(
                probabilityAnalysisJson,
                new TypeReference<List<ProbabilityInsightResponse>>() {
                },
                "probabilityAnalysis");
        List<RiskWarningResponse> riskWarnings = fromRequiredJsonList(
                riskWarningsJson,
                new TypeReference<List<RiskWarningResponse>>() {
                },
                "riskWarnings");
        List<SimulatedSelectionResponse> simulatedSelections = fromRequiredJsonList(
                simulatedSelectionsJson,
                new TypeReference<List<SimulatedSelectionResponse>>() {
                },
                "simulatedSelections");
        JsonNode llmOutput = fromJsonNode(llmOutputJson);
        validateV2PayloadLineage(
                payload,
                schemaVersion,
                workflowId,
                reportId,
                legacySnapshotId,
                authoritySnapshotId,
                authorityRevision,
                authorityType,
                inputSourceType,
                engineType,
                reportStatus,
                strategyParameters,
                probabilityAnalysis,
                riskWarnings,
                simulatedSelections,
                complianceNotice,
                generatedAt,
                providerKey,
                modelId,
                promptVersion,
                safetyStatus,
                llmAuditId,
                llmOutput,
                strategyDefaultsVersion);
        return new AnalysisReportV2Record(
                workflowId,
                reportId,
                authoritySnapshotId,
                authorityRevision,
                authorityType,
                inputSourceType,
                engineType,
                reportStatus,
                strategyParameters,
                strategyDefaultsVersion,
                probabilityAnalysis,
                riskWarnings,
                simulatedSelections,
                complianceNotice,
                generatedAt,
                providerKey,
                modelId,
                promptVersion,
                safetyStatus,
                llmAuditId,
                llmOutput);
    }

    private void validateV2PayloadLineage(
            AnalysisReportPayloadV2 payload,
            String schemaVersion,
            String workflowId,
            String reportId,
            String legacySnapshotId,
            String authoritySnapshotId,
            long authorityRevision,
            String authorityType,
            String inputSourceType,
            String engineType,
            String reportStatus,
            StrategyParameterRequest strategyParameters,
            List<ProbabilityInsightResponse> probabilityAnalysis,
            List<RiskWarningResponse> riskWarnings,
            List<SimulatedSelectionResponse> simulatedSelections,
            String complianceNotice,
            String generatedAt,
            String providerKey,
            String modelId,
            String promptVersion,
            String safetyStatus,
            String llmAuditId,
            JsonNode llmOutput,
            String strategyDefaultsVersion) {
        if (payload == null) {
            throw new IllegalStateException("Analysis report v2 integrity check failed for payload.");
        }
        requirePayloadMatch("schemaVersion", schemaVersion, payload.schemaVersion());
        requirePayloadMatch("workflowId", workflowId, payload.workflowId());
        requirePayloadMatch("reportId", reportId, payload.reportId());
        requirePayloadMatch(
                "authoritySnapshotId/payload.snapshotId",
                authoritySnapshotId,
                payload.snapshotId());
        requirePayloadMatch(
                "legacySnapshotId/authoritySnapshotId",
                legacySnapshotId,
                authoritySnapshotId);
        requirePayloadMatch(
                "legacySnapshotId/payload.snapshotId",
                legacySnapshotId,
                payload.snapshotId());
        requirePayloadMatch("authorityRevision", authorityRevision, payload.authorityRevision());
        requirePayloadMatch("authorityType", authorityType, payload.authorityType());
        requirePayloadMatch("inputSourceType", inputSourceType, payload.inputSourceType());
        requirePayloadMatch("engineType", engineType, payload.engineType());
        requirePayloadMatch("reportStatus", reportStatus, payload.reportStatus());
        requirePayloadMatch("strategyParameters", strategyParameters, payload.strategyParameters());
        requirePayloadMatch("probabilityAnalysis", probabilityAnalysis, payload.probabilityAnalysis());
        requirePayloadMatch("riskWarnings", riskWarnings, payload.riskWarnings());
        requirePayloadMatch("simulatedSelections", simulatedSelections, payload.simulatedSelections());
        requirePayloadMatch("complianceNotice", complianceNotice, payload.complianceNotice());
        requirePayloadMatch("generatedAt", generatedAt, payload.generatedAt());
        requirePayloadMatch("providerKey", providerKey, payload.providerKey());
        requirePayloadMatch("modelId", modelId, payload.modelId());
        requirePayloadMatch("promptVersion", promptVersion, payload.promptVersion());
        requirePayloadMatch("safetyStatus", safetyStatus, payload.safetyStatus());
        requirePayloadMatch("llmAuditId", llmAuditId, payload.llmAuditId());
        requirePayloadMatch("llmOutput", llmOutput, payload.llmOutput());
        requirePayloadMatch("strategyDefaultsVersion", strategyDefaultsVersion, payload.strategyDefaultsVersion());
    }

    private void requirePayloadMatch(String fieldName, Object columnValue, Object payloadValue) {
        if (!Objects.equals(columnValue, payloadValue)) {
            throw v2IntegrityFailure(fieldName);
        }
    }

    private IllegalStateException v2IntegrityFailure(String fieldName) {
        return new IllegalStateException(
                "Analysis report v2 integrity check failed for " + fieldName + ".");
    }

    private record ReportLookup(
            String schemaVersion,
            String payloadJson,
            String workflowId,
            String authorityType,
            String authoritySnapshotId,
            Long authorityRevision,
            String strategyDefaultsVersion) {

        private boolean isV2Candidate() {
            return AnalysisReportPayloadV2.SCHEMA_VERSION.equals(schemaVersion)
                    || workflowId != null
                    || authorityType != null
                    || authoritySnapshotId != null
                    || authorityRevision != null
                    || strategyDefaultsVersion != null;
        }
    }
}
