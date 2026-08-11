package org.footballlab.analysis.repository;

import java.util.List;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.AnalysisReportResponse;
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
        try {
            String payload = jdbcTemplate.queryForObject(
                    "select payload_json from analysis_report where report_id = ?",
                    String.class,
                    reportId);
            return Optional.of(fromJson(payload));
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

    private AnalysisReportResponse fromJson(String value) {
        try {
            return objectMapper.readValue(value, AnalysisReportResponse.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize analysis report payload.", exception);
        }
    }
}
