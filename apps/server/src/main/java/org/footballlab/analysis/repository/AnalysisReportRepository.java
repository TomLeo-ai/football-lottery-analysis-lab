package org.footballlab.analysis.repository;

import java.util.Optional;

import org.footballlab.analysis.domain.AnalysisReportResponse;

public interface AnalysisReportRepository {

    void save(AnalysisReportResponse report);

    Optional<AnalysisReportResponse> findById(String reportId);

    long nextReportSequence();
}
