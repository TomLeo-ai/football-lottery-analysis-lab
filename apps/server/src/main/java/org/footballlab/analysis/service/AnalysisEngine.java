package org.footballlab.analysis.service;

import org.footballlab.analysis.domain.AnalysisReportResponse;

public interface AnalysisEngine {

    String engineMode();

    AnalysisReportResponse generate(AnalysisEngineContext context);
}
