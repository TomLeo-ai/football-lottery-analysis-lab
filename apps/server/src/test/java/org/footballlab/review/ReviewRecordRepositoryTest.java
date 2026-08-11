package org.footballlab.review;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.review.domain.ItemSettlementResponse;
import org.footballlab.review.domain.ResultSourceResponse;
import org.footballlab.review.domain.ReviewRecordResponse;
import org.footballlab.review.domain.StrategyRevisionRuleResponse;
import org.footballlab.review.repository.JdbcReviewRecordRepository;
import org.footballlab.review.repository.ReviewRecordRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class ReviewRecordRepositoryTest {

    @Autowired
    private ReviewRecordRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldReadSavedReviewRecordAfterRepositoryRestartAndAllowOverwrite() {
        String suffix = UUID.randomUUID().toString();
        String planId = "review-plan-restart-" + suffix;
        ReviewRecordResponse firstRecord = buildRecord(planId, "NEEDS_REVIEW", "NEEDS_REVIEW", List.of("RESULT_NOT_AVAILABLE"));
        ReviewRecordResponse finalRecord = buildRecord(planId, "MISS", "MATCHED", List.of("DIRECTION_ERROR"));

        repository.save(firstRecord);
        repository.save(finalRecord);

        ReviewRecordRepository restartedRepository =
                new JdbcReviewRecordRepository(jdbcTemplate, objectMapper);

        assertThat(restartedRepository.existsByPlanId(planId)).isTrue();
        assertThat(restartedRepository.findByPlanId(planId))
                .contains(finalRecord);
    }

    private ReviewRecordResponse buildRecord(
            String planId,
            String reviewStatus,
            String matchStatus,
            List<String> failureReasons) {
        return new ReviewRecordResponse(
                planId,
                reviewStatus,
                matchStatus,
                BigDecimal.valueOf(0.98),
                List.of(new ItemSettlementResponse(
                        "review-item-" + planId,
                        "demo-match-001",
                        "AWAY_WIN",
                        "HOME_WIN",
                        "MISS",
                        failureReasons.get(0))),
                failureReasons,
                List.of(new StrategyRevisionRuleResponse(
                        "REVIEW_DIRECTION_WEIGHT",
                        failureReasons.get(0),
                        "Review rule generated for repository persistence test.")),
                new ResultSourceResponse(
                        "Mock Public Result Provider",
                        "https://example.com/mock-public-results",
                        "Fictional sample for local tests only",
                        "2099-07-01T20:45:00+08:00",
                        BigDecimal.valueOf(0.98)),
                List.of("HIT", "MISS", "PARTIAL_HIT", "VOID", "PENDING", "NEEDS_REVIEW"),
                List.of("DIRECTION_ERROR", "RESULT_NOT_AVAILABLE"),
                "2099-07-01T21:00:00+08:00");
    }
}
