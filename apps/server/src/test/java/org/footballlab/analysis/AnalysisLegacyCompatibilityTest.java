package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties =
        "spring.datasource.url=jdbc:h2:mem:analysis_report_v2_tests;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
class AnalysisLegacyCompatibilityTest {

    @Autowired
    private AnalysisReportRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldDowngradeLegacyRowEvenWhenPayloadClaimsV2Lineage() throws Exception {
        String suffix = UUID.randomUUID().toString();
        String reportId = "analysis-legacy-" + suffix;
        String snapshotId = "snapshot-legacy-" + suffix;
        AnalysisReportResponse forgedV2Payload = new AnalysisReportResponse(
                reportId,
                snapshotId,
                "USER_SCREENSHOT_CONFIRMED",
                "MOCK_RULE_ENGINE",
                "GENERATED",
                null,
                List.of(new ProbabilityInsightResponse(
                        "demo-match-legacy",
                        "2026-08-24",
                        "Fictional Coastal League",
                        "2026-08-24T19:30:00+08:00",
                        "Northport United",
                        "Lakeside City",
                        "HOME_WIN",
                        "MEDIUM",
                        "Legacy payload compatibility test.")),
                List.of(),
                List.of(),
                "非官方，仅模拟分析；仅供技术研究和流程验证。",
                "2026-08-23T11:00:00+08:00",
                null,
                null,
                null,
                "PASSED",
                null,
                null,
                "forged-workflow-" + suffix,
                "FORGED_V2_AUTHORITY",
                "ANALYSIS_REPORT_V2",
                "FORGED_STRATEGY_DEFAULTS",
                99L);

        jdbcTemplate.update("""
                        insert into analysis_report (
                            report_id, snapshot_id, input_source_type, engine_type, report_status,
                            compliance_notice, payload_json, generated_at, schema_version
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, null)
                        """,
                reportId,
                snapshotId,
                forgedV2Payload.inputSourceType(),
                forgedV2Payload.engineType(),
                forgedV2Payload.reportStatus(),
                forgedV2Payload.complianceNotice(),
                objectMapper.writeValueAsString(forgedV2Payload),
                forgedV2Payload.generatedAt());

        assertThat(repository.findAnyById(reportId))
                .hasValueSatisfying(reloaded -> {
                    assertThat(reloaded.reportId()).isEqualTo(reportId);
                    assertThat(reloaded.snapshotId()).isEqualTo(snapshotId);
                    assertThat(reloaded.probabilityAnalysis()).singleElement()
                            .extracting(ProbabilityInsightResponse::matchId)
                            .isEqualTo("demo-match-legacy");
                    assertThat(reloaded.workflowId()).isNull();
                    assertThat(reloaded.authorityType()).isNull();
                    assertThat(reloaded.authorityRevision()).isNull();
                    assertThat(reloaded.strategyDefaultsVersion()).isNull();
                    assertThat(reloaded.schemaVersion()).isEqualTo("LEGACY_V1");
                });
    }
}
