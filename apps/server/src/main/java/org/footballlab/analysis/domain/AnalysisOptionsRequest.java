package org.footballlab.analysis.domain;

import java.math.BigDecimal;

public record AnalysisOptionsRequest(
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
        String upsetCoverageLevel) {
}
