package org.footballlab.analysis.controller;

import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.service.AnalysisService;
import org.footballlab.common.Result;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AnalysisController {

    private final AnalysisService analysisService;

    public AnalysisController(AnalysisService analysisService) {
        this.analysisService = analysisService;
    }

    @PostMapping("/api/analysis/generate")
    public ResponseEntity<Result<AnalysisReportResponse>> generateAnalysis(
            @RequestBody AnalysisGenerateRequest request,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        AnalysisService.AnalysisGenerationResult generated = analysisService.generateAnalysis(request, idempotencyKey);
        return ResponseEntity
                .status(generated.httpStatus())
                .body(Result.success(generated.httpStatus().value(), generated.report()));
    }

    @GetMapping("/api/analysis/reports/{reportId}")
    public Result<AnalysisReportResponse> getReport(@PathVariable String reportId) {
        return Result.success(analysisService.getReport(reportId));
    }
}

