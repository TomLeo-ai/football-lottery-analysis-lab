package org.footballlab.analysis.service;

import org.footballlab.analysis.domain.ResolvedAnalysisEngineConfiguration;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AnalysisEngineConfigurationResolver {

    public static final String DEFAULT_PROMPT_VERSION = "danche-prediction-v1";

    public ResolvedAnalysisEngineConfiguration resolve(
            String engineMode,
            String providerKey,
            String modelId,
            String promptVersion) {
        String resolvedEngineMode = normalize(engineMode);
        if (resolvedEngineMode == null) {
            return resolveMock(providerKey, modelId, promptVersion);
        }
        if (MockRuleAnalysisEngine.ENGINE_MODE.equals(resolvedEngineMode)) {
            return resolveMock(providerKey, modelId, promptVersion);
        }
        if (OpenAiCompatibleAnalysisEngine.ENGINE_MODE.equals(resolvedEngineMode)) {
            return resolveOpenAiCompatible(providerKey, modelId, promptVersion);
        }
        throw badRequest("Unsupported engineMode: " + resolvedEngineMode);
    }

    private ResolvedAnalysisEngineConfiguration resolveMock(
            String providerKey,
            String modelId,
            String promptVersion) {
        if (hasText(providerKey) || hasText(modelId) || hasText(promptVersion)) {
            throw badRequest("Mock rule engine must not include providerKey, modelId, or promptVersion.");
        }
        return new ResolvedAnalysisEngineConfiguration(
                MockRuleAnalysisEngine.ENGINE_MODE,
                null,
                null,
                null);
    }

    private ResolvedAnalysisEngineConfiguration resolveOpenAiCompatible(
            String providerKey,
            String modelId,
            String promptVersion) {
        String normalizedProviderKey = normalize(providerKey);
        String normalizedModelId = normalize(modelId);
        String normalizedPromptVersion = valueOrDefault(normalize(promptVersion), DEFAULT_PROMPT_VERSION);
        if (!hasText(normalizedProviderKey)) {
            throw badRequest("providerKey is required for OPENAI_COMPATIBLE analysis.");
        }
        if (!hasText(normalizedModelId) || normalizedModelId.length() > 128) {
            throw badRequest("modelId is required and must be 1..128 characters for OPENAI_COMPATIBLE analysis.");
        }
        if (!DEFAULT_PROMPT_VERSION.equals(normalizedPromptVersion)) {
            throw badRequest("Unsupported promptVersion: " + normalizedPromptVersion);
        }
        return new ResolvedAnalysisEngineConfiguration(
                OpenAiCompatibleAnalysisEngine.ENGINE_MODE,
                normalizedProviderKey,
                normalizedModelId,
                normalizedPromptVersion);
    }

    private String normalize(String value) {
        return value == null ? null : value.trim();
    }

    private String valueOrDefault(String value, String defaultValue) {
        return hasText(value) ? value : defaultValue;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private ResponseStatusException badRequest(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }
}
