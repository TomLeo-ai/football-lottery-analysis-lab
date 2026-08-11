package org.footballlab.review.controller;

import java.util.List;

import org.footballlab.common.Result;
import org.footballlab.review.domain.PendingReviewPlanResponse;
import org.footballlab.review.domain.ResultMatchResponse;
import org.footballlab.review.domain.ReviewRecordResponse;
import org.footballlab.review.domain.ReviewSettleRequest;
import org.footballlab.review.service.ReviewWorkflowService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ReviewWorkflowController {

    private final ReviewWorkflowService reviewWorkflowService;

    public ReviewWorkflowController(ReviewWorkflowService reviewWorkflowService) {
        this.reviewWorkflowService = reviewWorkflowService;
    }

    @GetMapping("/reviews/pending")
    public Result<List<PendingReviewPlanResponse>> pendingReviews() {
        return Result.success(reviewWorkflowService.listPendingReviews());
    }

    @PostMapping("/simulated-plans/{planId}/match-result")
    public Result<ResultMatchResponse> matchResult(@PathVariable String planId) {
        return Result.success(reviewWorkflowService.matchResult(planId));
    }

    @PostMapping("/simulated-plans/{planId}/settle")
    public Result<ReviewRecordResponse> settle(
            @PathVariable String planId,
            @RequestBody(required = false) ReviewSettleRequest request) {
        return Result.success(reviewWorkflowService.settle(planId, request));
    }

    @GetMapping("/simulated-plans/{planId}/review")
    public Result<ReviewRecordResponse> review(@PathVariable String planId) {
        return Result.success(reviewWorkflowService.getReview(planId));
    }
}
