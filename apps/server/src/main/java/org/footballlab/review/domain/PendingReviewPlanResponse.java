package org.footballlab.review.domain;

public record PendingReviewPlanResponse(
        String planId,
        String planStatus,
        String reportId,
        int itemCount,
        String updatedAt) {
}
