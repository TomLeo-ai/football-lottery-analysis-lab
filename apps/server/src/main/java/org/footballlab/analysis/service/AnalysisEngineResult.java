package org.footballlab.analysis.service;

import java.util.Objects;

import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.llm.domain.LlmInvocationAuditRecord;

public record AnalysisEngineResult(AnalysisReportResponse report, LlmInvocationAuditRecord successAudit) {

    public AnalysisEngineResult(AnalysisReportResponse report) {
        this(report, null);
    }

    public AnalysisEngineResult {
        Objects.requireNonNull(report, "report is required");
    }
}
