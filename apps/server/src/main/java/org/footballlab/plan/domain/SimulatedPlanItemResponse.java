package org.footballlab.plan.domain;

import java.math.BigDecimal;

public record SimulatedPlanItemResponse(
        String planItemId,
        String matchId,
        String matchDate,
        String league,
        String homeTeam,
        String awayTeam,
        String kickoffTime,
        String playType,
        String selection,
        BigDecimal odds,
        BigDecimal stakeAmount,
        String itemStatus,
        String note) {
}
