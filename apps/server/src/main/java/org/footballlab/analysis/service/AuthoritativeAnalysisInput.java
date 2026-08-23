package org.footballlab.analysis.service;

import java.math.BigDecimal;
import java.util.List;

import org.footballlab.analysis.domain.AnalysisMarketRequest;
import org.footballlab.analysis.domain.AnalysisMatchRequest;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;

public record AuthoritativeAnalysisInput(
        String workflowId,
        String snapshotId,
        String authorityType,
        String sourceType,
        String snapshotStatus,
        boolean analysisAllowed,
        BigDecimal budgetAmount,
        String currency,
        String riskPreference,
        String confirmedAt,
        List<AnalysisMatchRequest> matches,
        List<AnalysisMarketRequest> markets) {

    public static AuthoritativeAnalysisInput fromConfirmedSnapshot(UserConfirmedSnapshotResponse snapshot) {
        return new AuthoritativeAnalysisInput(
                snapshot.workflowId(),
                snapshot.snapshotId(),
                snapshot.authorityType(),
                snapshot.sourceType(),
                snapshot.snapshotStatus(),
                snapshot.analysisAllowed(),
                snapshot.budgetAmount(),
                snapshot.currency(),
                snapshot.riskPreference(),
                snapshot.confirmedAt(),
                snapshot.matches() == null
                        ? List.of()
                        : snapshot.matches().stream()
                                .map(match -> new AnalysisMatchRequest(
                                        match.matchId(),
                                        match.matchDate(),
                                        match.league(),
                                        match.homeTeam(),
                                        match.awayTeam(),
                                        match.kickoffTime()))
                                .toList(),
                snapshot.markets() == null
                        ? List.of()
                        : snapshot.markets().stream()
                                .map(market -> new AnalysisMarketRequest(
                                        market.marketId(),
                                        market.matchId(),
                                        market.playType(),
                                        market.selection(),
                                        market.odds()))
                                .toList());
    }
}
