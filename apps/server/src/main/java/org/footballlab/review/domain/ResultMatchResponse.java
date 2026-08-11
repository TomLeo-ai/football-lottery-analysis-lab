package org.footballlab.review.domain;

import java.math.BigDecimal;
import java.util.List;

public record ResultMatchResponse(
        String planId,
        String matchStatus,
        BigDecimal matchConfidence,
        List<ResultMatchCandidateResponse> candidates,
        List<String> reviewWarnings) {
}
