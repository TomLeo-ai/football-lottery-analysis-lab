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
import org.footballlab.analysis.domain.ResolvedAnalysisEngineConfiguration;
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
    private final AnalysisEngineConfigurationResolver engineConfigurationResolver;
    private final Map<String, AnalysisEngine> analysisEngines;
    private final AtomicLong reportSequence;

    public AnalysisServiceImpl(
            AnalysisReportRepository analysisReportRepository,
            StrategyParameterValidator strategyParameterValidator,
            AnalysisEngineConfigurationResolver engineConfigurationResolver,
            List<AnalysisEngine> analysisEngines) {
        this.analysisReportRepository = analysisReportRepository;
        this.strategyParameterValidator = strategyParameterValidator;
        this.engineConfigurationResolver = engineConfigurationResolver;
        this.analysisEngines = analysisEngines.stream()
                .collect(Collectors.toUnmodifiableMap(AnalysisEngine::engineMode, Function.identity()));
        this.reportSequence = new AtomicLong(analysisReportRepository.nextReportSequence());
    }

    @Override
    public AnalysisReportResponse generateAnalysis(AnalysisGenerateRequest request) {
        AuthoritativeAnalysisInput input = AuthoritativeAnalysisInput.fromClientConfirmedRequest(request);
        validateConfirmedSnapshot(input);
        StrategyParameterRequest strategyParameters = strategyParameterValidator.resolve(request.strategyParameters());
        validateExcludedPlayTypes(input, strategyParameters);
        ResolvedAnalysisEngineConfiguration engineConfiguration = engineConfigurationResolver.resolve(
                request.engineMode(),
                request.providerKey(),
                request.modelId(),
                request.promptVersion());

        AnalysisReportResponse response = resolveAnalysisEngine(engineConfiguration.engineMode())
                .generate(new AnalysisEngineContext(
                        "analysis-%06d".formatted(reportSequence.getAndIncrement()),
                        OffsetDateTime.now(DEFAULT_ZONE).toString(),
                        input,
                        engineConfiguration,
                        strategyParameters));
        analysisReportRepository.save(response);
        return response;
    }

    private AnalysisEngine resolveAnalysisEngine(String engineMode) {
        AnalysisEngine analysisEngine = analysisEngines.get(engineMode);
        if (analysisEngine != null) {
            return analysisEngine;
        }
        throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Unsupported engineMode: " + engineMode);
    }

    private void validateExcludedPlayTypes(
            AuthoritativeAnalysisInput input,
            StrategyParameterRequest strategyParameters) {
        List<String> excludedPlayTypes = strategyParameters.excludedPlayTypes();
        boolean hasExcludedPlayType = input.markets().stream()
                .anyMatch(market -> excludedPlayTypes.contains(market.playType()));
        if (hasExcludedPlayType) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Excluded play type cannot be analyzed.");
        }
    }

    private void validateConfirmedSnapshot(AuthoritativeAnalysisInput input) {
        if (!REQUIRED_SOURCE_TYPE.equals(input.sourceType()) || !input.analysisAllowed()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only USER_SCREENSHOT_CONFIRMED snapshots can be analyzed.");
        }

        if (input.matches().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one confirmed match is required.");
        }

        if (input.markets().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one confirmed market is required.");
        }
    }
}
