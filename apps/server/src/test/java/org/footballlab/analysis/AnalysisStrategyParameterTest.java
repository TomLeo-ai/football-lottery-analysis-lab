package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;
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
        "spring.datasource.url=jdbc:h2:mem:analysis_strategy_parameter_tests;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class AnalysisStrategyParameterTest {

    private static final String NOW = "2026-08-23T16:00:00+08:00";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void returnsAndPersistsEffectiveStrategySnapshotFromDatabaseAuthorityAndOptions() throws Exception {
        StrategyFixture fixture = insertConfirmedV2Fixture();
        String request = """
                {
                  "snapshotId": "%s",
                  "engineMode": "MOCK_RULE_ENGINE",
                  "analysisOptions": {
                    "targetTicketCount": 4,
                    "minTicketCount": 3,
                    "maxTicketCount": 5,
                    "mainTicketRatio": 0.5,
                    "defensiveTicketRatio": 0.3,
                    "entertainmentTicketRatio": 0.2,
                    "enableEntertainmentTicket": true,
                    "entertainmentTicketMaxCost": 2,
                    "maxParlayLegs": 3,
                    "allowLowReturnTicket": true,
                    "upsetCoverageLevel": "STRONG"
                  }
                }
                """.formatted(fixture.snapshotId());

        MvcResult result = mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andExpect(jsonPath("$.data.engineType").value("MOCK_RULE_ENGINE"))
                .andExpect(jsonPath("$.data.workflowId").value(fixture.workflowId()))
                .andExpect(jsonPath("$.data.strategyDefaultsVersion")
                        .value(StrategyParameterDefaultsService.V2_DEFAULTS_VERSION))
                .andExpect(jsonPath("$.data.strategyParameters.budgetAmount").value(30.0))
                .andExpect(jsonPath("$.data.strategyParameters.currency").value("CNY"))
                .andExpect(jsonPath("$.data.strategyParameters.riskPreference").value("AGGRESSIVE"))
                .andExpect(jsonPath("$.data.strategyParameters.targetTicketCount").value(4))
                .andExpect(jsonPath("$.data.strategyParameters.minTicketCount").value(3))
                .andExpect(jsonPath("$.data.strategyParameters.maxTicketCount").value(5))
                .andExpect(jsonPath("$.data.strategyParameters.mainTicketRatio").value(0.5))
                .andExpect(jsonPath("$.data.strategyParameters.defensiveTicketRatio").value(0.3))
                .andExpect(jsonPath("$.data.strategyParameters.entertainmentTicketRatio").value(0.2))
                .andExpect(jsonPath("$.data.strategyParameters.maxParlayLegs").value(3))
                .andExpect(jsonPath("$.data.strategyParameters.preferredPlayTypes[0]")
                        .value("WIN_DRAW_LOSS"))
                .andExpect(jsonPath("$.data.strategyParameters.excludedPlayTypes").isEmpty())
                .andExpect(jsonPath("$.data.strategyParameters.exactScorePolicy").value("DISABLED"))
                .andExpect(jsonPath("$.data.strategyParameters.allowLowReturnTicket").value(true))
                .andExpect(jsonPath("$.data.strategyParameters.upsetCoverageLevel").value("STRONG"))
                .andExpect(jsonPath("$.data.simulatedSelections[0].stakeAmount").value(10.0))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("模拟")))
                .andReturn();

        String reportId = extractString(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "reportId");
        var persistedReport = analysisReportRepository.findV2ById(reportId).orElseThrow();
        assertThat(persistedReport.workflowId()).isEqualTo(fixture.workflowId());
        assertThat(persistedReport.snapshotId()).isEqualTo(fixture.snapshotId());
        assertThat(persistedReport.strategyDefaultsVersion())
                .isEqualTo(StrategyParameterDefaultsService.V2_DEFAULTS_VERSION);
        assertThat(persistedReport.strategyParameters()).isEqualTo(expectedStrategyParameters());
    }

    @Test
    void rejectsLegacyClientStrategyParameterAuthority() throws Exception {
        mockMvc.perform(post("/api/analysis/generate")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "snapshotId": "snapshot-strategy-client-override",
                                  "engineMode": "MOCK_RULE_ENGINE",
                                  "strategyParameters": {
                                    "excludedPlayTypes": ["WIN_DRAW_LOSS"]
                                  }
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode")
                        .value("CLIENT_ASSERTED_AUTHORITY_NOT_ALLOWED"))
                .andExpect(jsonPath("$.error.fieldErrors[0].fieldPath").value("strategyParameters"));
    }

    private StrategyFixture insertConfirmedV2Fixture() throws Exception {
        String suffix = UUID.randomUUID().toString();
        String workflowId = "workflow-strategy-" + suffix;
        String screenshotTaskId = "shot-strategy-" + suffix;
        String ocrTaskId = "ocr-strategy-" + suffix;
        String snapshotId = "snapshot-strategy-" + suffix;
        List<ConfirmedMatchResponse> matches = List.of(
                match("match-strategy-1-" + suffix, "Strategy North", "Strategy South"),
                match("match-strategy-2-" + suffix, "Strategy East", "Strategy West"),
                match("match-strategy-3-" + suffix, "Strategy Red", "Strategy Blue"));
        List<ConfirmedMarketResponse> markets = List.of(
                market("market-strategy-1-" + suffix, matches.get(0).matchId(), "HOME_WIN", "2.0500"),
                market("market-strategy-2-" + suffix, matches.get(1).matchId(), "DRAW", "3.1000"),
                market("market-strategy-3-" + suffix, matches.get(2).matchId(), "AWAY_WIN", "2.6000"));

        jdbcTemplate.update("""
                        insert into ocr_workflow (
                            workflow_id, current_stage, version, current_ocr_task_id,
                            confirmed_snapshot_id, current_report_id, created_at, updated_at
                        ) values (?, 'CONFIRMED', 3, ?, ?, null, ?, ?)
                        """,
                workflowId, ocrTaskId, snapshotId, NOW, NOW);
        jdbcTemplate.update("""
                        insert into screenshot_task (
                            task_id, file_name, content_type, file_size, sample_label, status,
                            server_ocr_enabled, privacy_policy, created_at, workflow_id,
                            source_declaration, source_policy_version, authority_type, provenance_json, schema_version
                        ) values (?, 'strategy.png', 'image/png', 1024, 'FICTIONAL_SAMPLE', 'CREATED',
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
                            'AGGRESSIVE', 30.00, 'CNY', ?, ?, '{}', ?, ?, 5,
                            'SERVER_CONFIRMED_V2', '{}', 'CONFIRMED_SNAPSHOT_V2')
                        """,
                snapshotId,
                ocrTaskId,
                objectMapper.writeValueAsString(matches),
                objectMapper.writeValueAsString(markets),
                NOW,
                workflowId);
        return new StrategyFixture(workflowId, snapshotId);
    }

    private ConfirmedMatchResponse match(String matchId, String homeTeam, String awayTeam) {
        return new ConfirmedMatchResponse(
                matchId,
                "2026-08-24",
                "Strategy League",
                homeTeam,
                awayTeam,
                "2026-08-24T19:30:00+08:00");
    }

    private ConfirmedMarketResponse market(String marketId, String matchId, String selection, String odds) {
        return new ConfirmedMarketResponse(
                marketId,
                matchId,
                "WIN_DRAW_LOSS",
                selection,
                new BigDecimal(odds));
    }

    private StrategyParameterRequest expectedStrategyParameters() {
        return new StrategyParameterRequest(
                new BigDecimal("30.00"),
                "CNY",
                4,
                3,
                5,
                "AGGRESSIVE",
                new BigDecimal("0.5"),
                new BigDecimal("0.3"),
                new BigDecimal("0.2"),
                true,
                new BigDecimal("2"),
                3,
                List.of("WIN_DRAW_LOSS"),
                List.of(),
                "DISABLED",
                null,
                true,
                "STRONG");
    }

    private static String extractString(String json, String fieldName) {
        String marker = "\"" + fieldName + "\":\"";
        int start = json.indexOf(marker);
        assertThat(start).isGreaterThanOrEqualTo(0);
        int valueStart = start + marker.length();
        int valueEnd = json.indexOf('"', valueStart);
        assertThat(valueEnd).isGreaterThan(valueStart);
        return json.substring(valueStart, valueEnd);
    }

    private record StrategyFixture(String workflowId, String snapshotId) {
    }
}
