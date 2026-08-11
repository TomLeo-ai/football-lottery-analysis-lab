package org.footballlab.analysis.domain;

public record RiskWarningResponse(
        String riskCode,
        String riskLevel,
        String message) {
}

