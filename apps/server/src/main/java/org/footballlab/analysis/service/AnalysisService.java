package org.footballlab.analysis.service;

import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;

public interface AnalysisService {

    AnalysisReportResponse generateAnalysis(AnalysisGenerateRequest request);

    AnalysisReportResponse getReport(String reportId);
}

