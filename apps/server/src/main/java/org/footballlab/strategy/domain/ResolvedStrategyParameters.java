package org.footballlab.strategy.domain;

import java.math.BigDecimal;
import java.util.List;

public record ResolvedStrategyParameters(
        BigDecimal budgetAmount,
        String currency,
        String riskPreference,
        Integer targetTicketCount,
        Integer minTicketCount,
        Integer maxTicketCount,
        BigDecimal mainTicketRatio,
        BigDecimal defensiveTicketRatio,
        BigDecimal entertainmentTicketRatio,
        Boolean enableEntertainmentTicket,
        BigDecimal entertainmentTicketMaxCost,
        Integer maxParlayLegs,
        BigDecimal minPayoutRequirement,
        Boolean allowLowReturnTicket,
        String upsetCoverageLevel,
        List<String> preferredPlayTypes,
        List<String> excludedPlayTypes,
        String exactScorePolicy,
        String defaultsVersion) {
}
