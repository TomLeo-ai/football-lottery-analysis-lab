package org.footballlab.llm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.analysis.domain.AnalysisMarketRequest;
import org.footballlab.analysis.domain.AnalysisMatchRequest;
import org.footballlab.llm.service.PromptContextBuilder;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.junit.jupiter.api.Test;

class PromptContextBuilderTest {

    private final PromptContextBuilder builder = new PromptContextBuilder(new ObjectMapper());

    @Test
    void shouldBuildPredictionContextWithStrategyParametersAndConfirmedSnapshotOnly() {
        StrategyParameterRequest strategyParameters = new StrategyParameterRequest(
                BigDecimal.valueOf(30),
                "CNY",
                4,
                3,
                5,
                "AGGRESSIVE",
                BigDecimal.valueOf(0.5),
                BigDecimal.valueOf(0.3),
                BigDecimal.valueOf(0.2),
                true,
                BigDecimal.valueOf(2),
                3,
                List.of("WIN_DRAW_LOSS"),
                List.of("EXACT_SCORE"),
                "DISABLED",
                null,
                true,
                "STRONG");
        AnalysisGenerateRequest request = new AnalysisGenerateRequest(
                "snapshot-demo-001",
                "USER_SCREENSHOT_CONFIRMED",
                true,
                "BALANCED",
                BigDecimal.valueOf(20),
                "CNY",
                "OPENAI_COMPATIBLE",
                "openai",
                "gpt-4o-mini",
                "danche-prediction-v1",
                strategyParameters,
                List.of(new AnalysisMatchRequest(
                        "demo-match-001",
                        "2026-07-01",
                        "Fictional Coastal League",
                        "Northport United",
                        "Lakeside City",
                        "2026-07-01T19:30:00+08:00")),
                List.of(new AnalysisMarketRequest(
                        "demo-market-001",
                        "demo-match-001",
                        "WIN_DRAW_LOSS",
                        "HOME_WIN",
                        BigDecimal.valueOf(2.05))));

        String context = builder.buildPredictionContext(request, strategyParameters);

        assertThat(context)
                .contains("strategyParameters")
                .contains("\"budgetAmount\":30")
                .contains("\"targetTicketCount\":4")
                .contains("USER_SCREENSHOT_CONFIRMED")
                .contains("Northport United")
                .contains("WIN_DRAW_LOSS")
                .doesNotContain("base64")
                .doesNotContain("screenshot")
                .doesNotContain("image");
    }
}
