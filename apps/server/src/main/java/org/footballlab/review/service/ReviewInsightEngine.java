package org.footballlab.review.service;

import org.footballlab.review.domain.ReviewInsightContext;
import org.footballlab.review.domain.ReviewInsightResponse;

public interface ReviewInsightEngine {

    String reviewEngineMode();

    ReviewInsightResponse generate(ReviewInsightContext context);
}
