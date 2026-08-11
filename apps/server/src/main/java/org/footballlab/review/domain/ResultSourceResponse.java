package org.footballlab.review.domain;

import java.math.BigDecimal;

public record ResultSourceResponse(
        String sourceName,
        String sourceUrl,
        String sourceLicense,
        String fetchedAt,
        BigDecimal confidence) {
}
