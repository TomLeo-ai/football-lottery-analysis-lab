package org.footballlab.analysis.domain;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.json.StrictRequestFields;

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

    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        StrictRequestFields.reject("analysisOptions." + name);
    }
}
