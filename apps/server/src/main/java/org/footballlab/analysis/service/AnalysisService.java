package org.footballlab.analysis.service;

import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.springframework.http.HttpStatus;

public interface AnalysisService {

    AnalysisGenerationResult generateAnalysis(AnalysisGenerateRequest request, String idempotencyKey);

    AnalysisReportResponse getReport(String reportId);

    record AnalysisGenerationResult(HttpStatus httpStatus, AnalysisReportResponse report) {
    }
}

