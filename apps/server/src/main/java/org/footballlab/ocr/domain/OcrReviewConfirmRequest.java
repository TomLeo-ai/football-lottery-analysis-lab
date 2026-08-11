package org.footballlab.ocr.domain;

import java.math.BigDecimal;
import java.util.List;

public record OcrReviewConfirmRequest(
        String ocrTaskId,
        String riskPreference,
        BigDecimal budgetAmount,
        String currency,
        List<ConfirmedMatchRequest> matches,
        List<ConfirmedMarketRequest> markets) {
}

