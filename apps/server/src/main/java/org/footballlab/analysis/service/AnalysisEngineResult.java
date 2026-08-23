package org.footballlab.analysis.service;

import java.util.Objects;

import org.footballlab.analysis.domain.AnalysisReportResponse;

public record AnalysisEngineResult(AnalysisReportResponse report) {

    public AnalysisEngineResult {
        Objects.requireNonNull(report, "report is required");
    }
}
