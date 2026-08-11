package org.footballlab.llm.service;

import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import org.footballlab.llm.domain.EngineSettingsRequest;
import org.footballlab.llm.domain.EngineSettingsResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EngineSettingsService {

    private static final String DEFAULT_ANALYSIS_ENGINE_MODE = "MOCK_RULE_ENGINE";
    private static final String DEFAULT_REVIEW_INSIGHT_MODE = "RULE_REVIEW_ONLY";
    private static final Set<String> ANALYSIS_ENGINE_MODES = Set.of("MOCK_RULE_ENGINE", "OPENAI_COMPATIBLE");
    private static final Set<String> REVIEW_INSIGHT_MODES = Set.of(
            "RULE_REVIEW_ONLY",
            "RULE_REVIEW_WITH_LLM_INSIGHT");

    private final AtomicReference<String> analysisEngineMode = new AtomicReference<>(DEFAULT_ANALYSIS_ENGINE_MODE);
    private final AtomicReference<String> reviewInsightMode = new AtomicReference<>(DEFAULT_REVIEW_INSIGHT_MODE);

    public EngineSettingsResponse getSettings() {
        return new EngineSettingsResponse(
                DEFAULT_ANALYSIS_ENGINE_MODE,
                analysisEngineMode.get(),
                reviewInsightMode.get());
    }

    public EngineSettingsResponse updateSettings(EngineSettingsRequest request) {
        String nextAnalysisEngineMode = resolveMode(
                request.analysisEngineMode(),
                analysisEngineMode.get(),
                ANALYSIS_ENGINE_MODES,
                "analysisEngineMode");
        String nextReviewInsightMode = resolveMode(
                request.reviewInsightMode(),
                reviewInsightMode.get(),
                REVIEW_INSIGHT_MODES,
                "reviewInsightMode");

        analysisEngineMode.set(nextAnalysisEngineMode);
        reviewInsightMode.set(nextReviewInsightMode);
        return getSettings();
    }

    private String resolveMode(String requestedMode, String currentMode, Set<String> allowedModes, String fieldName) {
        if (requestedMode == null || requestedMode.isBlank()) {
            return currentMode;
        }
        if (!allowedModes.contains(requestedMode)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported " + fieldName + ": " + requestedMode);
        }
        return requestedMode;
    }
}
