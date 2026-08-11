package org.footballlab.strategy.domain;

import java.math.BigDecimal;
import java.util.List;

public record StrategyParameterRequest(
        BigDecimal budgetAmount,
        String currency,
        Integer targetTicketCount,
        Integer minTicketCount,
        Integer maxTicketCount,
        String riskPreference,
        BigDecimal mainTicketRatio,
        BigDecimal defensiveTicketRatio,
        BigDecimal entertainmentTicketRatio,
        Boolean enableEntertainmentTicket,
        BigDecimal entertainmentTicketMaxCost,
        Integer maxParlayLegs,
        List<String> preferredPlayTypes,
        List<String> excludedPlayTypes,
        String exactScorePolicy,
        BigDecimal minPayoutRequirement,
        Boolean allowLowReturnTicket,
        String upsetCoverageLevel) {
}
