package org.footballlab.analysis.service;

import java.math.BigDecimal;
import java.util.List;

import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.analysis.domain.AnalysisMarketRequest;
import org.footballlab.analysis.domain.AnalysisMatchRequest;

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

    public static AuthoritativeAnalysisInput fromClientConfirmedRequest(AnalysisGenerateRequest request) {
        return new AuthoritativeAnalysisInput(
                null,
                request.snapshotId(),
                "CLIENT_CONFIRMED_COMPATIBILITY_INPUT",
                request.sourceType(),
                "CONFIRMED",
                request.analysisAllowed(),
                request.budgetAmount(),
                request.currency(),
                request.riskPreference(),
                null,
                request.matches() == null ? List.of() : List.copyOf(request.matches()),
                request.markets() == null ? List.of() : List.copyOf(request.markets()));
    }
}
