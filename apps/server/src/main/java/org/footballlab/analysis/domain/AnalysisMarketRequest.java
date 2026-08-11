package org.footballlab.analysis.domain;

import java.math.BigDecimal;

public record AnalysisMarketRequest(
        String marketId,
        String matchId,
        String playType,
        String selection,
        BigDecimal odds) {
}

