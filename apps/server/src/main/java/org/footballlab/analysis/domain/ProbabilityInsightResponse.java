package org.footballlab.analysis.domain;

public record ProbabilityInsightResponse(
        String matchId,
        String matchDate,
        String league,
        String kickoffTime,
        String homeTeam,
        String awayTeam,
        String selection,
        String probabilityBand,
        String rationale) {
}
