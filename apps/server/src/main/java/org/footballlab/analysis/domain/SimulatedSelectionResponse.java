package org.footballlab.analysis.domain;

import java.math.BigDecimal;

public record SimulatedSelectionResponse(
        String matchId,
        String playType,
        String selection,
        BigDecimal odds,
        BigDecimal stakeAmount,
        String note) {
}

