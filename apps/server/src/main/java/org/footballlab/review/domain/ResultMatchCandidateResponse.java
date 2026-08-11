package org.footballlab.review.domain;

import java.math.BigDecimal;

public record ResultMatchCandidateResponse(
        String candidateId,
        String planItemId,
        String resultSnapshotId,
        String matchId,
        String matchStatus,
        BigDecimal confidence,
        String sourceName,
        String sourceUrl,
        String sourceLicense,
        String fetchedAt) {
}
