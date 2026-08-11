package org.footballlab.resultprovider.domain;

import java.math.BigDecimal;

public record PublicResultSnapshotResponse(
        String resultSnapshotId,
        String matchId,
        String matchDate,
        String league,
        String homeTeam,
        String awayTeam,
        String kickoffTime,
        int homeScore,
        int awayScore,
        String resultStatus,
        String sourceName,
        String sourceUrl,
        String sourceLicense,
        String fetchedAt,
        BigDecimal confidence) {
}
