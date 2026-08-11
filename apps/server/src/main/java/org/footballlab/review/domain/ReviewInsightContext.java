package org.footballlab.review.domain;

import org.footballlab.plan.domain.SimulatedPlanResponse;

public record ReviewInsightContext(
        SimulatedPlanResponse plan,
        ReviewRecordResponse ruleReviewRecord,
        ReviewSettleRequest request) {
}
