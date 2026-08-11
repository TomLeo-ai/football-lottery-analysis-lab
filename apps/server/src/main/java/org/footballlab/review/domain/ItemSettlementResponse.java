package org.footballlab.review.domain;

public record ItemSettlementResponse(
        String planItemId,
        String matchId,
        String selection,
        String actualOutcome,
        String settlementStatus,
        String failureReason) {
}
