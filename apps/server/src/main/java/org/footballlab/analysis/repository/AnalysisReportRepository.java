package org.footballlab.analysis.repository;

import java.util.Optional;

import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.persistence.AnalysisReportV2Record;

public interface AnalysisReportRepository {

    void save(AnalysisReportResponse report);

    Optional<AnalysisReportResponse> findById(String reportId);

    void insertV2(AnalysisReportV2Record report);

    Optional<AnalysisReportV2Record> findV2ById(String reportId);

    Optional<AnalysisReportV2Record> findV2ByWorkflowId(String workflowId);

    Optional<AnalysisReportResponse> findAnyById(String reportId);

    long nextReportSequence();
}
