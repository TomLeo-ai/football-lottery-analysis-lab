package org.footballlab.review.repository;

import java.util.Optional;

import org.footballlab.review.domain.ReviewRecordResponse;

public interface ReviewRecordRepository {

    void save(ReviewRecordResponse reviewRecord);

    Optional<ReviewRecordResponse> findByPlanId(String planId);

    boolean existsByPlanId(String planId);
}
