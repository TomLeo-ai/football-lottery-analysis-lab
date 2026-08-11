package org.footballlab.review.service;

import java.util.List;

import org.footballlab.review.domain.PendingReviewPlanResponse;
import org.footballlab.review.domain.ResultMatchResponse;
import org.footballlab.review.domain.ReviewRecordResponse;
import org.footballlab.review.domain.ReviewSettleRequest;

public interface ReviewWorkflowService {

    List<PendingReviewPlanResponse> listPendingReviews();

    ResultMatchResponse matchResult(String planId);

    ReviewRecordResponse settle(String planId, ReviewSettleRequest request);

    default ReviewRecordResponse settle(String planId) {
        return settle(planId, null);
    }

    ReviewRecordResponse getReview(String planId);
}
