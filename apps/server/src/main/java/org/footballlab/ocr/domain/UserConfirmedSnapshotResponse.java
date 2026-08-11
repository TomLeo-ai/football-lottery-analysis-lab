package org.footballlab.ocr.domain;

import java.math.BigDecimal;
import java.util.List;

public record UserConfirmedSnapshotResponse(
        String snapshotId,
        String ocrTaskId,
        String sourceType,
        String snapshotStatus,
        boolean analysisAllowed,
        String riskPreference,
        BigDecimal budgetAmount,
        String currency,
        List<ConfirmedMatchResponse> matches,
        List<ConfirmedMarketResponse> markets,
        String confirmedAt) {
}

