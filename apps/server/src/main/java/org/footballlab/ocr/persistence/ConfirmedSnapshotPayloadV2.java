package org.footballlab.ocr.persistence;

import java.math.BigDecimal;
import java.util.List;

import org.footballlab.ocr.domain.ConfirmedMarketResponse;
import org.footballlab.ocr.domain.ConfirmedMatchResponse;

public record ConfirmedSnapshotPayloadV2(
        String schemaVersion,
        String workflowId,
        String ocrTaskId,
        long confirmedRevision,
        String sourceType,
        String snapshotStatus,
        boolean analysisAllowed,
        String riskPreference,
        BigDecimal budgetAmount,
        String currency,
        List<ConfirmedMatchResponse> matches,
        List<ConfirmedMarketResponse> markets
) {
}
