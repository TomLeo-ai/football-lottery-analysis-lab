package org.footballlab.strategy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;

import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.footballlab.strategy.service.StrategyParameterDefaultsService;
import org.footballlab.strategy.service.StrategyParameterValidator;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class StrategyParameterValidatorTest {

    private final StrategyParameterDefaultsService defaultsService = new StrategyParameterDefaultsService();
    private final StrategyParameterValidator validator = new StrategyParameterValidator(defaultsService);

    @Test
    void shouldResolveBackendDefaultsWhenRequestIsMissing() {
        StrategyParameterRequest resolved = validator.resolve(null);

        assertThat(resolved.budgetAmount()).isEqualByComparingTo("20.00");
        assertThat(resolved.currency()).isEqualTo("CNY");
        assertThat(resolved.targetTicketCount()).isEqualTo(5);
        assertThat(resolved.minTicketCount()).isEqualTo(5);
        assertThat(resolved.maxTicketCount()).isEqualTo(6);
        assertThat(resolved.riskPreference()).isEqualTo("BALANCED");
        assertThat(resolved.enableEntertainmentTicket()).isTrue();
        assertThat(resolved.entertainmentTicketMaxCost()).isEqualByComparingTo("2.00");
        assertThat(resolved.maxParlayLegs()).isEqualTo(4);
        assertThat(resolved.exactScorePolicy()).isEqualTo("ENTERTAINMENT_ONLY");
        assertThat(resolved.upsetCoverageLevel()).isEqualTo("BALANCED");
    }

    @Test
    void shouldKeepUserOverridesAndFillMissingDefaults() {
        StrategyParameterRequest request = new StrategyParameterRequest(
                BigDecimal.valueOf(30),
                null,
                4,
                3,
                5,
                "AGGRESSIVE",
                BigDecimal.valueOf(0.5),
                BigDecimal.valueOf(0.3),
                BigDecimal.valueOf(0.2),
                false,
                BigDecimal.ONE,
                3,
                List.of("WIN_DRAW_LOSS"),
                List.of("EXACT_SCORE"),
                "DISABLED",
                null,
                true,
                "LIGHT");

        StrategyParameterRequest resolved = validator.resolve(request);

        assertThat(resolved.budgetAmount()).isEqualByComparingTo("30.00");
        assertThat(resolved.currency()).isEqualTo("CNY");
        assertThat(resolved.targetTicketCount()).isEqualTo(4);
        assertThat(resolved.riskPreference()).isEqualTo("AGGRESSIVE");
        assertThat(resolved.enableEntertainmentTicket()).isFalse();
        assertThat(resolved.excludedPlayTypes()).containsExactly("EXACT_SCORE");
    }

    @Test
    void shouldRejectConflictingTicketCountRange() {
        StrategyParameterRequest request = new StrategyParameterRequest(
                BigDecimal.valueOf(20),
                "CNY",
                7,
                3,
                5,
                "BALANCED",
                BigDecimal.valueOf(0.6),
                BigDecimal.valueOf(0.3),
                BigDecimal.valueOf(0.1),
                true,
                BigDecimal.valueOf(2),
                4,
                List.of("WIN_DRAW_LOSS"),
                List.of(),
                "ENTERTAINMENT_ONLY",
                null,
                false,
                "BALANCED");

        assertThatThrownBy(() -> validator.resolve(request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("targetTicketCount");
    }

    @Test
    void shouldRejectRatioSumThatDoesNotEqualOne() {
        StrategyParameterRequest request = new StrategyParameterRequest(
                BigDecimal.valueOf(20),
                "CNY",
                5,
                5,
                6,
                "BALANCED",
                BigDecimal.valueOf(0.8),
                BigDecimal.valueOf(0.3),
                BigDecimal.valueOf(0.1),
                true,
                BigDecimal.valueOf(2),
                4,
                List.of("WIN_DRAW_LOSS"),
                List.of(),
                "ENTERTAINMENT_ONLY",
                null,
                false,
                "BALANCED");

        assertThatThrownBy(() -> validator.resolve(request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("budget ratios");
    }
}
