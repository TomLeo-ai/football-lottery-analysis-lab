package org.footballlab.ocr.domain;

import java.math.BigDecimal;
import java.util.List;

public record OcrReviewDraftResponse(
        String ocrTaskId,
        String workflowId,
        long revision,
        String draftStatus,
        String riskPreference,
        BigDecimal budgetAmount,
        String currency,
        List<DraftMatchRequest> matches,
        List<DraftMarketRequest> markets,
        String schemaVersion,
        String updatedAt
) {
}
