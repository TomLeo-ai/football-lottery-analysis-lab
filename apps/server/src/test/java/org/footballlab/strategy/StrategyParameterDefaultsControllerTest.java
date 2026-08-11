package org.footballlab.strategy;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class StrategyParameterDefaultsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldReturnBackendStrategyParameterDefaults() throws Exception {
        mockMvc.perform(get("/api/strategy-parameter-defaults"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.budgetAmount").value(20.0))
                .andExpect(jsonPath("$.data.currency").value("CNY"))
                .andExpect(jsonPath("$.data.targetTicketCount").value(5))
                .andExpect(jsonPath("$.data.riskPreference").value("BALANCED"))
                .andExpect(jsonPath("$.data.maxParlayLegs").value(4))
                .andExpect(jsonPath("$.data.exactScorePolicy").value("ENTERTAINMENT_ONLY"));
    }

    @Test
    void shouldUpdateDefaultsAfterValidation() throws Exception {
        String request = """
                {
                  "budgetAmount": 30,
                  "currency": "CNY",
                  "targetTicketCount": 4,
                  "minTicketCount": 3,
                  "maxTicketCount": 5,
                  "riskPreference": "CONSERVATIVE",
                  "mainTicketRatio": 0.7,
                  "defensiveTicketRatio": 0.2,
                  "entertainmentTicketRatio": 0.1,
                  "enableEntertainmentTicket": true,
                  "entertainmentTicketMaxCost": 2,
                  "maxParlayLegs": 3,
                  "preferredPlayTypes": ["WIN_DRAW_LOSS"],
                  "excludedPlayTypes": ["EXACT_SCORE"],
                  "exactScorePolicy": "DISABLED",
                  "allowLowReturnTicket": false,
                  "upsetCoverageLevel": "LIGHT"
                }
                """;

        mockMvc.perform(put("/api/strategy-parameter-defaults")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.budgetAmount").value(30.0))
                .andExpect(jsonPath("$.data.targetTicketCount").value(4))
                .andExpect(jsonPath("$.data.excludedPlayTypes[0]").value("EXACT_SCORE"))
                .andExpect(jsonPath("$.data.exactScorePolicy").value("DISABLED"));
    }
}
