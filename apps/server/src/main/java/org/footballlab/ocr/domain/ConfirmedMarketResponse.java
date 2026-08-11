package org.footballlab.ocr.domain;

import java.math.BigDecimal;

public record ConfirmedMarketResponse(
        String marketId,
        String matchId,
        String playType,
        String selection,
        BigDecimal odds) {
}

