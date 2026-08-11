package org.footballlab.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;

import com.jayway.jsonpath.JsonPath;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.repository.SimulatedPlanRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class SimulatedPlanControllerTest {

    private static final List<String> BLOCKED_OUTPUT_TERMS = List.of(
            "\u5fc5\u4e2d",
            "\u7a33\u8d5a",
            "\u5305\u4e2d",
            "\u56de\u672c",
            "\u8ddf\u6295",
            "\u5b9e\u5355\u63a8\u8350",
            "\u52a0\u6ce8",
            "\u652f\u4ed8\u63a5\u53e3");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SimulatedPlanRepository simulatedPlanRepository;

    @Test
    void shouldGenerateSaveListAndReadSimulatedPlanAsPendingResult() throws Exception {
        MvcResult simulateResult = mockMvc.perform(post("/api/strategies/simulate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "reportId": "analysis-demo-001",
                                  "snapshotId": "snapshot-demo-001",
                                  "inputSourceType": "USER_SCREENSHOT_CONFIRMED",
                                  "reportStatus": "GENERATED",
                                  "currency": "CNY",
                                  "budgetAmount": 20,
                                  "strategyParameters": {
                                    "budgetAmount": 30,
                                    "currency": "CNY",
                                    "targetTicketCount": 4,
                                    "minTicketCount": 3,
                                    "maxTicketCount": 5,
                                    "riskPreference": "AGGRESSIVE",
                                    "mainTicketRatio": 0.5,
                                    "defensiveTicketRatio": 0.3,
                                    "entertainmentTicketRatio": 0.2,
                                    "enableEntertainmentTicket": true,
                                    "entertainmentTicketMaxCost": 2,
                                    "maxParlayLegs": 3,
                                    "preferredPlayTypes": ["WIN_DRAW_LOSS"],
                                    "excludedPlayTypes": ["EXACT_SCORE"],
                                    "exactScorePolicy": "DISABLED",
                                    "allowLowReturnTicket": true,
                                    "upsetCoverageLevel": "STRONG"
                                  },
                                  "riskWarnings": [
                                    {
                                      "riskCode": "INFO_RISK",
                                      "riskLevel": "MEDIUM",
                                      "message": "仅基于用户确认快照，缺少公开赛果交叉验证。"
                                    }
                                  ],
                                  "simulatedSelections": [
                                    {
                                      "matchId": "demo-match-001",
                                      "playType": "WIN_DRAW_LOSS",
                                      "selection": "HOME_WIN",
                                      "odds": 2.05,
                                      "stakeAmount": 10,
                                      "note": "模拟选择，用于生成待保存方案。"
                                    }
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planId").exists())
                .andExpect(jsonPath("$.data.planType").value("SIMULATED_ONLY"))
                .andExpect(jsonPath("$.data.planStatus").value("GENERATED"))
                .andExpect(jsonPath("$.data.statusFlow[0]").value("GENERATED"))
                .andExpect(jsonPath("$.data.items[0].matchId").value("demo-match-001"))
                .andExpect(jsonPath("$.data.snapshot.reportId").value("analysis-demo-001"))
                .andExpect(jsonPath("$.data.strategyParameters.budgetAmount").value(30.0))
                .andExpect(jsonPath("$.data.snapshot.strategyParameters.targetTicketCount").value(4))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("非官方")))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("仅模拟")))
                .andReturn();

        String generatedBody = simulateResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String generatedPlanId = JsonPath.read(generatedBody, "$.data.planId");

        MvcResult saveResult = mockMvc.perform(post("/api/simulated-plans")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "generatedPlanId": "%s",
                                  "operatorNote": "保存为等待公开赛果阶段的模拟方案。"
                                }
                                """.formatted(generatedPlanId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planId").value(generatedPlanId))
                .andExpect(jsonPath("$.data.planStatus").value("PENDING_RESULT"))
                .andExpect(jsonPath("$.data.statusFlow[0]").value("GENERATED"))
                .andExpect(jsonPath("$.data.statusFlow[1]").value("SAVED"))
                .andExpect(jsonPath("$.data.statusFlow[2]").value("PENDING_RESULT"))
                .andExpect(jsonPath("$.data.items[0].planItemId").exists())
                .andExpect(jsonPath("$.data.snapshot.snapshotId").value("snapshot-demo-001"))
                .andExpect(jsonPath("$.data.strategyParameters.upsetCoverageLevel").value("STRONG"))
                .andReturn();

        mockMvc.perform(get("/api/simulated-plans"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].planId").value(generatedPlanId))
                .andExpect(jsonPath("$.data[0].planStatus").value("PENDING_RESULT"))
                .andExpect(jsonPath("$.data[0].strategyParameters.exactScorePolicy").value("DISABLED"));

        mockMvc.perform(get("/api/simulated-plans/{planId}", generatedPlanId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planId").value(generatedPlanId))
                .andExpect(jsonPath("$.data.snapshot.reportId").value("analysis-demo-001"))
                .andExpect(jsonPath("$.data.snapshot.strategyParameters.maxParlayLegs").value(3));

        assertThat(simulatedPlanRepository.findPlan(generatedPlanId))
                .isPresent()
                .get()
                .extracting(SimulatedPlanResponse::planStatus)
                .isEqualTo("PENDING_RESULT");

        String savedBody = saveResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        for (String term : BLOCKED_OUTPUT_TERMS) {
            assertThat(generatedBody + savedBody).doesNotContain(term);
        }
    }
}
