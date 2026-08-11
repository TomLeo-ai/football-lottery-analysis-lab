package org.footballlab.analysis.service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.footballlab.analysis.domain.AnalysisGenerateRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.footballlab.strategy.service.StrategyParameterValidator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AnalysisServiceImpl implements AnalysisService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final String REQUIRED_SOURCE_TYPE = "USER_SCREENSHOT_CONFIRMED";

    private final AnalysisReportRepository analysisReportRepository;
    private final StrategyParameterValidator strategyParameterValidator;
    private final Map<String, AnalysisEngine> analysisEngines;
    private final AtomicLong reportSequence;

    public AnalysisServiceImpl(
            AnalysisReportRepository analysisReportRepository,
            StrategyParameterValidator strategyParameterValidator,
            List<AnalysisEngine> analysisEngines) {
        this.analysisReportRepository = analysisReportRepository;
        this.strategyParameterValidator = strategyParameterValidator;
        this.analysisEngines = analysisEngines.stream()
                .collect(Collectors.toUnmodifiableMap(AnalysisEngine::engineMode, Function.identity()));
        this.reportSequence = new AtomicLong(analysisReportRepository.nextReportSequence());
    }

    @Override
    public AnalysisReportResponse generateAnalysis(AnalysisGenerateRequest request) {
        validateConfirmedSnapshot(request);
        StrategyParameterRequest strategyParameters = strategyParameterValidator.resolve(request.strategyParameters());
        validateExcludedPlayTypes(request, strategyParameters);

        AnalysisReportResponse response = resolveAnalysisEngine(request.engineMode())
                .generate(new AnalysisEngineContext(
                        "analysis-%06d".formatted(reportSequence.getAndIncrement()),
                        OffsetDateTime.now(DEFAULT_ZONE).toString(),
                        request,
                        strategyParameters));
        analysisReportRepository.save(response);
        return response;
    }

    private AnalysisEngine resolveAnalysisEngine(String engineMode) {
        String resolvedEngineMode = engineMode == null || engineMode.isBlank()
                ? MockRuleAnalysisEngine.ENGINE_MODE
                : engineMode;
        AnalysisEngine analysisEngine = analysisEngines.get(resolvedEngineMode);
        if (analysisEngine != null) {
            return analysisEngine;
        }
        throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Unsupported engineMode: " + resolvedEngineMode);
    }

    private void validateExcludedPlayTypes(
            AnalysisGenerateRequest request,
            StrategyParameterRequest strategyParameters) {
        List<String> excludedPlayTypes = strategyParameters.excludedPlayTypes();
        boolean hasExcludedPlayType = request.markets().stream()
                .anyMatch(market -> excludedPlayTypes.contains(market.playType()));
        if (hasExcludedPlayType) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Excluded play type cannot be analyzed.");
        }
    }

    private void validateConfirmedSnapshot(AnalysisGenerateRequest request) {
        if (!REQUIRED_SOURCE_TYPE.equals(request.sourceType()) || !request.analysisAllowed()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only USER_SCREENSHOT_CONFIRMED snapshots can be analyzed.");
        }

        if (request.matches() == null || request.matches().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one confirmed match is required.");
        }

        if (request.markets() == null || request.markets().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one confirmed market is required.");
        }
    }
}
