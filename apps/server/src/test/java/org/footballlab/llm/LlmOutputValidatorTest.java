package org.footballlab.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.AnalysisMarketRequest;
import org.footballlab.llm.service.LlmOutputValidator;
import org.footballlab.llm.service.SafetyGuardService;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class LlmOutputValidatorTest {

    private final LlmOutputValidator validator = new LlmOutputValidator(
            new ObjectMapper(),
            new SafetyGuardService());

    @Test
    void shouldAcceptPredictionOutputThatObeysStrategyParameters() {
        var result = validator.validatePredictionOutput(validOutput(), parameters(), confirmedMarkets());

        assertThat(result.safetyStatus()).isEqualTo("PASSED");
        assertThat(result.output().path("ticketGroups")).hasSize(2);
    }

    @Test
    void shouldAcceptMarkdownWrappedPredictionJsonFromOpenAiCompatibleProviders() {
        String markdownWrappedOutput = """
                ```json
                %s
                ```
                """.formatted(validOutput());

        var result = validator.validatePredictionOutput(markdownWrappedOutput, parameters(), confirmedMarkets());

        assertThat(result.safetyStatus()).isEqualTo("PASSED");
        assertThat(result.output().path("finalDecision").path("summary").asText())
                .contains("概率化模拟分析");
    }

    @Test
    void shouldRejectBlockedTermsAndStrategyParameterViolations() {
        assertThatThrownBy(() -> validator.validatePredictionOutput(
                        validOutput().replace("概率化模拟分析", "\u56de\u672c模拟分析"),
                        parameters(),
                        confirmedMarkets()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("BLOCKED_TERM");

        assertThatThrownBy(() -> validator.validatePredictionOutput(
                        validOutput().replace("\"playType\": \"WIN_DRAW_LOSS\"", "\"playType\": \"EXACT_SCORE\""),
                        parameters(),
                        confirmedMarkets()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("UNSUPPORTED_PLAY_TYPE");

        assertThatThrownBy(() -> validator.validatePredictionOutput(
                        validOutput().replace("\"cost\": 12", "\"cost\": 32"),
                        parameters(),
                        confirmedMarkets()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("BUDGET_EXCEEDED");

        assertThatThrownBy(() -> validator.validatePredictionOutput(
                        validOutput().replace("\"legs\": [\"demo-match-001\", \"demo-match-002\"]",
                                "\"legs\": [\"demo-match-001\", \"demo-match-002\", \"demo-match-003\", \"demo-match-004\"]"),
                        parameters(),
                        confirmedMarkets()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("MAX_PARLAY_LEGS_EXCEEDED");
    }

    @Test
    void shouldRejectPredictionSelectionThatIsNotInConfirmedMarkets() {
        assertThatThrownBy(() -> validator.validatePredictionOutput(
                        validOutput().replace("\"selection\": \"HOME_WIN\"", "\"selection\": \"AWAY_WIN\""),
                        parameters(),
                        confirmedMarkets()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("INVALID_SELECTION_MARKET");
    }

    @Test
    void shouldRejectNonWdlSelectionEvenWhenConfirmedMarketsAreCorrupted() {
        List<AnalysisMarketRequest> corruptedMarkets = List.of(
                new AnalysisMarketRequest("market-001", "demo-match-001", "EXACT_SCORE", "HOME_WIN", BigDecimal.valueOf(8.80)));

        assertThatThrownBy(() -> validator.validatePredictionOutput(
                        validOutput().replace("\"playType\": \"WIN_DRAW_LOSS\"", "\"playType\": \"EXACT_SCORE\""),
                        parameters(),
                        corruptedMarkets))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("UNSUPPORTED_PLAY_TYPE");

        assertThatThrownBy(() -> validator.validatePredictionOutput(
                        validOutput().replace("\"selection\": \"HOME_WIN\"", "\"selection\": \"HOME_DRAW\""),
                        parameters(),
                        confirmedMarkets()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("UNSUPPORTED_SELECTION");
    }

    @Test
    void shouldRejectNonExactComplianceNotice() {
        assertThatThrownBy(() -> validator.validatePredictionOutput(
                        validOutput().replace(
                                "非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议，不承诺命中率、收益或确定性结果。",
                                "非官方模拟分析结果，不构成购彩建议。"),
                        parameters(),
                        confirmedMarkets()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("MISSING_COMPLIANCE_NOTICE");
    }

    @Test
    void shouldRejectReviewInsightOutputThatTriesToModifyRuleSettlement() {
        assertThatThrownBy(() -> validator.validateReviewInsightOutput("""
                        {
                          "settlementAuthorityNotice": "规则引擎结算已锁定，大模型只解释原因。",
                          "ticketReviewNarratives": [],
                          "failureClassifications": [],
                          "strategyRevisionSuggestions": [],
                          "nextRoundParameterSuggestions": {},
                          "doNotOverreactEvents": [],
                          "reviewStatus": "HIT",
                          "complianceNotice": "非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议，不承诺命中率、收益或确定性结果。"
                        }
                        """))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("REVIEW_SETTLEMENT_MUTATION_FIELD");
    }

    private static StrategyParameterRequest parameters() {
        return new StrategyParameterRequest(
                BigDecimal.valueOf(30),
                "CNY",
                2,
                1,
                3,
                "BALANCED",
                BigDecimal.valueOf(0.6),
                BigDecimal.valueOf(0.3),
                BigDecimal.valueOf(0.1),
                true,
                BigDecimal.valueOf(2),
                3,
                List.of("WIN_DRAW_LOSS"),
                List.of("EXACT_SCORE"),
                "DISABLED",
                null,
                false,
                "BALANCED");
    }

    private static List<AnalysisMarketRequest> confirmedMarkets() {
        return List.of(
                new AnalysisMarketRequest("market-001", "demo-match-001", "WIN_DRAW_LOSS", "HOME_WIN", BigDecimal.valueOf(1.80)),
                new AnalysisMarketRequest("market-002", "demo-match-002", "WIN_DRAW_LOSS", "DRAW", BigDecimal.valueOf(3.30)),
                new AnalysisMarketRequest("market-003", "demo-match-003", "WIN_DRAW_LOSS", "DRAW", BigDecimal.valueOf(3.10)));
    }

    private static String validOutput() {
        return """
                {
                  "parameterUsage": {
                    "budgetAmount": 30,
                    "targetTicketCount": 2,
                    "maxParlayLegs": 3
                  },
                  "scorePredictions": [],
                  "upsetFocus": [],
                  "stableMatches": [],
                  "ticketGroups": [
                    {
                      "ticketType": "MAIN",
                      "cost": 12,
                      "legs": ["demo-match-001", "demo-match-002"],
                      "selections": [
                        {
                          "matchId": "demo-match-001",
                          "playType": "WIN_DRAW_LOSS",
                          "selection": "HOME_WIN"
                        }
                      ]
                    },
                    {
                      "ticketType": "DEFENSIVE",
                      "cost": 18,
                      "legs": ["demo-match-003"],
                      "selections": [
                        {
                          "matchId": "demo-match-003",
                          "playType": "WIN_DRAW_LOSS",
                          "selection": "DRAW"
                        }
                      ]
                    }
                  ],
                  "finalDecision": {
                    "summary": "概率化模拟分析，保留不确定性。"
                  },
                  "ledgerSnapshot": {
                    "ticketCount": 2
                  },
                  "complianceNotice": "非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议，不承诺命中率、收益或确定性结果。"
                }
                """;
    }
}
