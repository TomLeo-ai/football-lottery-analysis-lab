package org.footballlab.analysis.domain;

public record AnalysisMatchRequest(
        String matchId,
        String matchDate,
        String league,
        String homeTeam,
        String awayTeam,
        String kickoffTime) {
}

