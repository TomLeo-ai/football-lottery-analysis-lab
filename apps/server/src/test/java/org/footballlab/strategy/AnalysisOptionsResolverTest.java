package org.footballlab.strategy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;

import org.footballlab.analysis.domain.AnalysisOptionsRequest;
import org.footballlab.strategy.service.AnalysisOptionsResolver;
import org.footballlab.strategy.service.StrategyParameterDefaultsService;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class AnalysisOptionsResolverTest {

    private final AnalysisOptionsResolver resolver = new AnalysisOptionsResolver();

    @Test
    void shouldResolveFrozenWdlDefaultsWithoutReadingMutableDefaults() {
        var resolved = resolver.resolve(
                null,
                new BigDecimal("1.50"),
                "CNY",
                "LOW",
                3);

        assertThat(resolved.budgetAmount()).isEqualByComparingTo("1.50");
        assertThat(resolved.currency()).isEqualTo("CNY");
        assertThat(resolved.riskPreference()).isEqualTo("LOW");
        assertThat(resolved.targetTicketCount()).isEqualTo(3);
        assertThat(resolved.minTicketCount()).isEqualTo(3);
        assertThat(resolved.maxTicketCount()).isEqualTo(3);
        assertThat(resolved.entertainmentTicketMaxCost()).isEqualByComparingTo("1.50");
        assertThat(resolved.maxParlayLegs()).isEqualTo(3);
        assertThat(resolved.preferredPlayTypes()).containsExactly("WIN_DRAW_LOSS");
        assertThat(resolved.excludedPlayTypes()).isEmpty();
        assertThat(resolved.exactScorePolicy()).isEqualTo("DISABLED");
        assertThat(resolved.defaultsVersion()).isEqualTo(StrategyParameterDefaultsService.V2_DEFAULTS_VERSION);
    }

    @Test
    void shouldUseDynamicTicketAndParlayCapsForLargeMatchSets() {
        var resolved = resolver.resolve(
                null,
                new BigDecimal("20.00"),
                "CNY",
                "BALANCED",
                12);

        assertThat(resolved.targetTicketCount()).isEqualTo(4);
        assertThat(resolved.maxParlayLegs()).isEqualTo(10);
        assertThat(resolved.entertainmentTicketMaxCost()).isEqualByComparingTo("2.00");
    }

    @Test
    void shouldApplyPartialOptionsWhileKeepingAuthorityFieldsSnapshotOwned() {
        var resolved = resolver.resolve(
                new AnalysisOptionsRequest(
                        3,
                        2,
                        4,
                        new BigDecimal("0.50"),
                        new BigDecimal("0.30"),
                        new BigDecimal("0.20"),
                        false,
                        new BigDecimal("1.25"),
                        2,
                        new BigDecimal("6.50"),
                        true,
                        "STRONG"),
                new BigDecimal("20.00"),
                "CNY",
                "AGGRESSIVE",
                4);

        assertThat(resolved.targetTicketCount()).isEqualTo(3);
        assertThat(resolved.minTicketCount()).isEqualTo(2);
        assertThat(resolved.maxTicketCount()).isEqualTo(4);
        assertThat(resolved.enableEntertainmentTicket()).isFalse();
        assertThat(resolved.minPayoutRequirement()).isEqualByComparingTo("6.50");
        assertThat(resolved.allowLowReturnTicket()).isTrue();
        assertThat(resolved.upsetCoverageLevel()).isEqualTo("STRONG");
        assertThat(resolved.preferredPlayTypes()).isEqualTo(List.of("WIN_DRAW_LOSS"));
    }

    @Test
    void shouldRejectInvalidRangesPrecisionAndEnums() {
        assertThatThrownBy(() -> resolver.resolve(
                        new AnalysisOptionsRequest(5, 1, 3, null, null, null, null, null, null, null, null, null),
                        new BigDecimal("20.00"),
                        "CNY",
                        "BALANCED",
                        4))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("targetTicketCount");

        assertThatThrownBy(() -> resolver.resolve(
                        new AnalysisOptionsRequest(null, null, null,
                                new BigDecimal("0.605"), new BigDecimal("0.30"), new BigDecimal("0.095"),
                                null, null, null, null, null, null),
                        new BigDecimal("20.00"),
                        "CNY",
                        "BALANCED",
                        4))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("mainTicketRatio");

        assertThatThrownBy(() -> resolver.resolve(
                        new AnalysisOptionsRequest(null, null, null,
                                new BigDecimal("0.60"), new BigDecimal("0.30"), new BigDecimal("0.09"),
                                null, null, null, null, null, null),
                        new BigDecimal("20.00"),
                        "CNY",
                        "BALANCED",
                        4))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("budget ratios");

        assertThatThrownBy(() -> resolver.resolve(
                        new AnalysisOptionsRequest(null, null, null, null, null, null,
                                null, new BigDecimal("2.001"), null, null, null, null),
                        new BigDecimal("20.00"),
                        "CNY",
                        "BALANCED",
                        4))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("entertainmentTicketMaxCost");

        assertThatThrownBy(() -> resolver.resolve(
                        new AnalysisOptionsRequest(null, null, null, null, null, null,
                                null, null, 11, null, null, null),
                        new BigDecimal("20.00"),
                        "CNY",
                        "BALANCED",
                        12))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("maxParlayLegs");

        assertThatThrownBy(() -> resolver.resolve(
                        new AnalysisOptionsRequest(null, null, null, null, null, null,
                                null, null, null, null, null, "HEAVY"),
                        new BigDecimal("20.00"),
                        "CNY",
                        "BALANCED",
                        4))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("upsetCoverageLevel");
    }

    @Test
    void shouldRejectNonSnapshotAuthorityValues() {
        assertThatThrownBy(() -> resolver.resolve(null, new BigDecimal("20.00"), "USD", "BALANCED", 2))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("currency");

        assertThatThrownBy(() -> resolver.resolve(null, new BigDecimal("20.001"), "CNY", "BALANCED", 2))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("budgetAmount");

        assertThatThrownBy(() -> resolver.resolve(null, new BigDecimal("20.00"), "CNY", "CONSERVATIVE", 2))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("riskPreference");
    }
}
