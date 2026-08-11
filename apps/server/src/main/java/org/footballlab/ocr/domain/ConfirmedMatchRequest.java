package org.footballlab.ocr.domain;

public record ConfirmedMatchRequest(
        String matchId,
        String matchDate,
        String league,
        String homeTeam,
        String awayTeam,
        String kickoffTime) {
}

