package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.footballlab.analysis.persistence.AnalysisReportPayloadV2;
import org.footballlab.analysis.persistence.AnalysisReportV2Record;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.footballlab.strategy.service.StrategyParameterDefaultsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties =
        "spring.datasource.url=jdbc:h2:mem:analysis_report_v2_tests;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class AnalysisControllerTest {

    private static final List<String> BLOCKED_OUTPUT_TERMS = List.of(
            "\u5fc5\u4e2d",
            "\u7a33\u8d5a",
            "\u5305\u4e2d",
            "\u56de\u672c",
            "\u8ddf\u6295",
            "\u5b9e\u5355\u63a8\u8350",
            "\u52a0\u6ce8");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void shouldGenerateMockAnalysisOnlyFromUserConfirmedSnapshot() throws Exception {
        String request = """
                {
                  "snapshotId": "snapshot-demo-001",
                  "sourceType": "USER_SCREENSHOT_CONFIRMED",
                  "analysisAllowed": true,
                  "riskPreference": "BALANCED",
                  "budgetAmount": 20,
                  "currency": "CNY",
                  "matches": [
                    {
                      "matchId": "demo-match-001",
                      "matchDate": "2026-07-01",
                      "league": "Fictional Coastal League",
                      "homeTeam": "Northport United",
                      "awayTeam": "Lakeside City",
                      "kickoffTime": "2026-07-01T19:30:00+08:00"
                    }
                  ],
                  "markets": [
                    {
                      "marketId": "demo-market-001",
                      "matchId": "demo-match-001",
                      "playType": "WIN_DRAW_LOSS",
                      "selection": "HOME_WIN",
                      "odds": 2.05
                    }
                  ]
                }
                """;

        MvcResult result = mockMvc.perform(post("/api/analysis/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reportId").exists())
                .andExpect(jsonPath("$.data.snapshotId").value("snapshot-demo-001"))
                .andExpect(jsonPath("$.data.inputSourceType").value("USER_SCREENSHOT_CONFIRMED"))
                .andExpect(jsonPath("$.data.engineType").value("MOCK_RULE_ENGINE"))
                .andExpect(jsonPath("$.data.reportStatus").value("GENERATED"))
                .andExpect(jsonPath("$.data.probabilityAnalysis[0].matchId").value("demo-match-001"))
                .andExpect(jsonPath("$.data.riskWarnings[0].riskCode").value("INFO_RISK"))
                .andExpect(jsonPath("$.data.simulatedSelections[0].selection").value("HOME_WIN"))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("非官方")))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("仅模拟分析")))
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String reportId = JsonFieldExtractor.extractString(body, "reportId");
        assertThat(analysisReportRepository.findById(reportId))
                .isPresent()
                .get()
                .extracting(report -> report.reportStatus())
                .isEqualTo("GENERATED");
        mockMvc.perform(get("/api/analysis/reports/{reportId}", reportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.reportId").value(reportId))
                .andExpect(jsonPath("$.data.snapshotId").value("snapshot-demo-001"))
                .andExpect(jsonPath("$.data.inputSourceType").value("USER_SCREENSHOT_CONFIRMED"))
                .andExpect(jsonPath("$.data.engineType").value("MOCK_RULE_ENGINE"))
                .andExpect(jsonPath("$.data.reportStatus").value("GENERATED"))
                .andExpect(jsonPath("$.data.probabilityAnalysis[0].matchId").value("demo-match-001"))
                .andExpect(jsonPath("$.data.riskWarnings[0].riskCode").value("INFO_RISK"))
                .andExpect(jsonPath("$.data.simulatedSelections[0].selection").value("HOME_WIN"))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("仅模拟分析")));
        for (String term : BLOCKED_OUTPUT_TERMS) {
            assertThat(body).doesNotContain(term);
        }
    }

    @Test
    void shouldRejectUnconfirmedSnapshotForAnalysis() throws Exception {
        String request = """
                {
                  "snapshotId": "ocr-demo-001",
                  "sourceType": "WAITING_USER_CONFIRMATION",
                  "analysisAllowed": false,
                  "riskPreference": "BALANCED",
                  "budgetAmount": 20,
                  "currency": "CNY",
                  "matches": [],
                  "markets": []
                }
                """;

        mockMvc.perform(post("/api/analysis/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isBadRequest());
    }

    @Test
    void shouldReturnNotFoundWhenAnalysisReportDoesNotExist() throws Exception {
        String missingReportId = "analysis-missing-" + UUID.randomUUID();

        mockMvc.perform(get("/api/analysis/reports/{reportId}", missingReportId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(404))
                .andExpect(jsonPath("$.msg").value("error"))
                .andExpect(jsonPath("$.error.errorCode").value("HTTP_404"))
                .andExpect(jsonPath("$.error.message").value("Analysis report not found."));
    }

    @Test
    void shouldGetPersistedV2AnalysisReportWithAuthoritativeMetadata() throws Exception {
        String suffix = UUID.randomUUID().toString();
        V2ControllerFixture fixture = insertV2LineageFixture(suffix);
        AnalysisReportV2Record report = createV2Report(fixture, suffix);
        analysisReportRepository.insertV2(report);

        mockMvc.perform(get("/api/analysis/reports/{reportId}", report.reportId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.reportId").value(report.reportId()))
                .andExpect(jsonPath("$.data.snapshotId").value(fixture.snapshotId()))
                .andExpect(jsonPath("$.data.workflowId").value(fixture.workflowId()))
                .andExpect(jsonPath("$.data.schemaVersion").value(AnalysisReportPayloadV2.SCHEMA_VERSION))
                .andExpect(jsonPath("$.data.authorityType").value(AnalysisReportV2Record.AUTHORITY_TYPE))
                .andExpect(jsonPath("$.data.authorityRevision").value(1))
                .andExpect(jsonPath("$.data.engineType").value("OPENAI_COMPATIBLE"))
                .andExpect(jsonPath("$.data.providerKey").value("controller-provider"))
                .andExpect(jsonPath("$.data.modelId").value("controller-model"))
                .andExpect(jsonPath("$.data.promptVersion").value("controller-prompt-v2"))
                .andExpect(jsonPath("$.data.safetyStatus").value("PASSED"))
                .andExpect(jsonPath("$.data.strategyDefaultsVersion")
                        .value(StrategyParameterDefaultsService.V2_DEFAULTS_VERSION));
    }

    private V2ControllerFixture insertV2LineageFixture(String suffix) {
        String workflowId = "workflow-controller-v2-" + suffix;
        String screenshotTaskId = "screenshot-controller-v2-" + suffix;
        String ocrTaskId = "ocr-controller-v2-" + suffix;
        String snapshotId = "snapshot-controller-v2-" + suffix;
        String timestamp = "2026-08-23T12:00:00+08:00";

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
                        ) values (?, 'controller-v2.png', 'image/png', 1024, 'FICTIONAL_SAMPLE',
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
        return new V2ControllerFixture(workflowId, snapshotId);
    }

    private AnalysisReportV2Record createV2Report(V2ControllerFixture fixture, String suffix) {
        return new AnalysisReportV2Record(
                fixture.workflowId(),
                "analysis-controller-v2-" + suffix,
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
                List.of(),
                List.of(),
                List.of(),
                "非官方，仅模拟分析；仅供技术研究和流程验证。",
                "2026-08-23T12:05:00+08:00",
                "controller-provider",
                "controller-model",
                "controller-prompt-v2",
                "PASSED",
                "controller-audit-v2-" + suffix,
                JsonNodeFactory.instance.objectNode().put("summary", "Controller v2 GET fixture."));
    }

    private record V2ControllerFixture(String workflowId, String snapshotId) {
    }

    private static final class JsonFieldExtractor {

        private JsonFieldExtractor() {
        }

        static String extractString(String json, String fieldName) {
            String marker = "\"" + fieldName + "\":\"";
            int start = json.indexOf(marker);
            assertThat(start).isGreaterThanOrEqualTo(0);
            int valueStart = start + marker.length();
            int valueEnd = json.indexOf('"', valueStart);
            assertThat(valueEnd).isGreaterThan(valueStart);
            return json.substring(valueStart, valueEnd);
        }
    }
}
