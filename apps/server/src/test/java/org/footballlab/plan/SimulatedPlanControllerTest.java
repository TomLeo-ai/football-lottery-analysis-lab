package org.footballlab.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties =
        "spring.datasource.url=jdbc:h2:mem:plan_controller_tests;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class SimulatedPlanControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.update("delete from review_record");
        jdbcTemplate.update("delete from simulated_plan_item");
        jdbcTemplate.update("delete from simulated_plan");
        jdbcTemplate.update("delete from workflow_operation");
        jdbcTemplate.update("delete from analysis_report");
        jdbcTemplate.update("delete from ocr_confirmed_snapshot");
        jdbcTemplate.update("delete from ocr_task");
        jdbcTemplate.update("delete from screenshot_task");
        jdbcTemplate.update("delete from ocr_workflow");
    }

    @Test
    void generatesAndSavesOnlyFromPersistedAuthoritativeReport() throws Exception {
        AuthoritativePlanTestFixture.Fixture fixture = AuthoritativePlanTestFixture.insert(
                jdbcTemplate, objectMapper, analysisReportRepository);

        MvcResult generatedResult = mockMvc.perform(post("/api/strategies/simulate")
                        .header("Idempotency-Key", AuthoritativePlanTestFixture.idempotencyKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reportId":"%s"}
                                """.formatted(fixture.reportId())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andExpect(jsonPath("$.data.planStatus").value("GENERATED"))
                .andExpect(jsonPath("$.data.reportId").value(fixture.reportId()))
                .andExpect(jsonPath("$.data.snapshotId").value(fixture.snapshotId()))
                .andExpect(jsonPath("$.data.currency").value("CNY"))
                .andExpect(jsonPath("$.data.budgetAmount").value(36.5))
                .andExpect(jsonPath("$.data.strategyParameters.riskPreference").value("BALANCED"))
                .andExpect(jsonPath("$.data.items[0].matchId").value(fixture.matchId()))
                .andExpect(jsonPath("$.data.items[0].league").value("Authoritative League"))
                .andExpect(jsonPath("$.data.items[0].playType").value("WIN_DRAW_LOSS"))
                .andExpect(jsonPath("$.data.items[0].selection").value("HOME_WIN"))
                .andExpect(jsonPath("$.data.items[0].odds").value(2.15))
                .andExpect(jsonPath("$.data.items[0].stakeAmount").value(12.5))
                .andExpect(jsonPath("$.data.snapshot.inputSourceType").value("USER_SCREENSHOT_CONFIRMED"))
                .andExpect(jsonPath("$.data.snapshot.engineType").value("MOCK_RULE_ENGINE"))
                .andReturn();
        String planId = data(generatedResult).path("planId").asText();

        assertThat(planId).startsWith("sim-plan-");
        assertThat(data(generatedResult).path("items").get(0).path("planItemId").asText())
                .startsWith("sim-item-");
        assertThat(data(generatedResult).path("snapshot").path("planSnapshotId").asText())
                .startsWith("sim-snapshot-");
        assertThat(workflow(fixture.workflowId()))
                .containsEntry("current_stage", "PLAN_GENERATED")
                .containsEntry("current_plan_id", planId);

        mockMvc.perform(get("/api/simulated-plans/{planId}", planId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planStatus").value("GENERATED"));

        Map<String, Object> itemBefore = itemRow(planId);
        String payloadBefore = String.valueOf(itemBefore.get("payload_json"));
        MvcResult savedResult = mockMvc.perform(post("/api/simulated-plans")
                        .header("Idempotency-Key", AuthoritativePlanTestFixture.idempotencyKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"generatedPlanId":"%s","operatorNote":"  waiting for results  "}
                                """.formatted(planId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.planId").value(planId))
                .andExpect(jsonPath("$.data.planStatus").value("PENDING_RESULT"))
                .andExpect(jsonPath("$.data.operatorNote").value("waiting for results"))
                .andReturn();

        mockMvc.perform(get("/api/simulated-plans/{planId}", planId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planStatus").value("PENDING_RESULT"));
        mockMvc.perform(get("/api/simulated-plans"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.planId == '%s')].planStatus".formatted(planId))
                        .value("PENDING_RESULT"));

        assertThat(workflow(fixture.workflowId()))
                .containsEntry("current_stage", "PENDING_RESULT")
                .containsEntry("current_plan_id", planId);
        assertThat(itemRow(planId)).containsAllEntriesOf(itemBefore);
        assertThat(String.valueOf(itemRow(planId).get("payload_json"))).isEqualTo(payloadBefore);
        assertThat(data(savedResult).path("items")).isEqualTo(data(generatedResult).path("items"));
    }

    private JsonNode data(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
    }

    private Map<String, Object> workflow(String workflowId) {
        return jdbcTemplate.queryForMap("select * from ocr_workflow where workflow_id = ?", workflowId);
    }

    private Map<String, Object> itemRow(String planId) {
        return jdbcTemplate.queryForMap("select * from simulated_plan_item where plan_id = ?", planId);
    }
}
