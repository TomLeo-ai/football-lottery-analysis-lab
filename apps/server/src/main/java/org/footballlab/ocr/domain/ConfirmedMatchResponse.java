package org.footballlab.ocr.domain;

public record ConfirmedMatchResponse(
        String matchId,
        String matchDate,
        String league,
        String homeTeam,
        String awayTeam,
        String kickoffTime) {
}

