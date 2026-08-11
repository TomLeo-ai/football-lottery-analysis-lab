package org.footballlab.analysis.controller;

import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.service.AnalysisService;
import org.footballlab.common.Result;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AnalysisController {

    private final AnalysisService analysisService;

    public AnalysisController(AnalysisService analysisService) {
        this.analysisService = analysisService;
    }

    @PostMapping("/api/analysis/generate")
    public Result<AnalysisReportResponse> generateAnalysis(@RequestBody AnalysisGenerateRequest request) {
        return Result.success(analysisService.generateAnalysis(request));
    }
}

