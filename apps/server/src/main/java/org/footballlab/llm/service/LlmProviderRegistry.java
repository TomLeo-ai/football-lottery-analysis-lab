package org.footballlab.llm.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.footballlab.llm.domain.LlmChatRequest;
import org.footballlab.llm.domain.ModelProviderConnectionTestResponse;
import org.footballlab.llm.domain.ModelProviderResponse;
import org.footballlab.llm.domain.LlmProviderInvocationConfig;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LlmProviderRegistry {

    private static final String CREDENTIAL_CONFIGURED = "CONFIGURED";
    private static final String CREDENTIAL_MISSING = "MISSING";
    private static final String CONNECTION_UNTESTED = "UNTESTED";
    private static final String CONNECTION_SKIPPED = "SKIPPED";
    private static final String CONNECTION_CONNECTED = "CONNECTED";
    private static final String CONNECTION_FAILED = "FAILED";
    private static final String ERROR_NONE = "NONE";
    private static final String ERROR_MISSING_CREDENTIAL = "MISSING_CREDENTIAL";

    private final Environment environment;
    private final OpenAiCompatibleLlmClient llmClient;
    private final List<ProviderTemplate> providerTemplates = List.of(
            new ProviderTemplate(
                    "openai",
                    "OpenAI",
                    "https://api.openai.com/v1",
                    "gpt-4o-mini",
                    "OPENAI_API_KEY",
                    true),
            new ProviderTemplate(
                    "azure-openai",
                    "Azure OpenAI",
                    "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
                    "gpt-4o-mini",
                    "AZURE_OPENAI_API_KEY",
                    true),
            new ProviderTemplate(
                    "deepseek",
                    "DeepSeek",
                    "https://api.deepseek.com",
                    "deepseek-v4-pro",
                    "DEEPSEEK_API_KEY",
                    true),
            new ProviderTemplate(
                    "dashscope-qwen",
                    "DashScope Qwen",
                    "https://dashscope.aliyuncs.com/compatible-mode/v1",
                    "qwen-plus",
                    "DASHSCOPE_API_KEY",
                    true),
            new ProviderTemplate(
                    "zhipu-glm",
                    "Zhipu GLM",
                    "https://open.bigmodel.cn/api/paas/v4",
                    "glm-4-flash",
                    "ZHIPU_API_KEY",
                    true),
            new ProviderTemplate(
                    "volcengine-ark",
                    "Volcengine Ark",
                    "https://ark.cn-beijing.volces.com/api/v3",
                    "doubao-seed-1-6",
                    "ARK_API_KEY",
                    true),
            new ProviderTemplate(
                    "moonshot-kimi",
                    "Moonshot Kimi",
                    "https://api.moonshot.cn/v1",
                    "moonshot-v1-8k",
                    "MOONSHOT_API_KEY",
                    true),
            new ProviderTemplate(
                    "gemini-openai",
                    "Gemini OpenAI Compatible",
                    "https://generativelanguage.googleapis.com/v1beta/openai",
                    "gemini-2.0-flash",
                    "GEMINI_API_KEY",
                    true),
            new ProviderTemplate(
                    "openrouter",
                    "OpenRouter",
                    "https://openrouter.ai/api/v1",
                    "openai/gpt-4o-mini",
                    "OPENROUTER_API_KEY",
                    true),
            new ProviderTemplate(
                    "litellm-proxy",
                    "LiteLLM Proxy",
                    "http://127.0.0.1:4000/v1",
                    "gpt-4o-mini",
                    "LITELLM_PROXY_API_KEY",
                    true),
            new ProviderTemplate(
                    "local-openai-compatible",
                    "Local OpenAI-compatible",
                    "http://127.0.0.1:8000/v1",
                    "local-model",
                    "LOCAL_OPENAI_COMPATIBLE_API_KEY",
                    true));

    public LlmProviderRegistry(Environment environment, OpenAiCompatibleLlmClient llmClient) {
        this.environment = environment;
        this.llmClient = llmClient;
    }

    public List<ModelProviderResponse> listProviders() {
        return providerTemplates.stream()
                .map(this::toResponse)
                .toList();
    }

    public ModelProviderConnectionTestResponse testConnection(String providerKey, String modelId) {
        Instant startedAt = Instant.now();
        ProviderTemplate provider = findProvider(providerKey);
        String resolvedModelId = isBlank(modelId) ? provider.defaultModel() : modelId;

        if (CREDENTIAL_MISSING.equals(resolveCredentialStatus(provider.apiKeyEnvName()))) {
            return new ModelProviderConnectionTestResponse(
                    provider.providerKey(),
                    resolvedModelId,
                    CONNECTION_SKIPPED,
                    elapsedMillis(startedAt),
                    ERROR_MISSING_CREDENTIAL);
        }

        try {
            llmClient.createChatCompletion(new LlmChatRequest(
                    provider.providerKey(),
                    provider.baseUrl(),
                    environment.getProperty(provider.apiKeyEnvName()),
                    resolvedModelId,
                    "You are a connection test endpoint. Return a minimal JSON object.",
                    "{\"connectionTest\":true}"));
            return new ModelProviderConnectionTestResponse(
                    provider.providerKey(),
                    resolvedModelId,
                    CONNECTION_CONNECTED,
                    elapsedMillis(startedAt),
                    ERROR_NONE);
        } catch (ResponseStatusException exception) {
            return new ModelProviderConnectionTestResponse(
                    provider.providerKey(),
                    resolvedModelId,
                    CONNECTION_FAILED,
                    elapsedMillis(startedAt),
                    safeErrorType(exception.getReason(), exception.getStatusCode().toString()));
        } catch (RuntimeException exception) {
            return new ModelProviderConnectionTestResponse(
                    provider.providerKey(),
                    resolvedModelId,
                    CONNECTION_FAILED,
                    elapsedMillis(startedAt),
                    safeErrorType(exception.getClass().getSimpleName(), "LLM_CONNECTION_TEST_FAILED"));
        }
    }

    public LlmProviderInvocationConfig resolveInvocationConfig(String providerKey, String modelId) {
        if (isBlank(providerKey)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "MODEL_PROVIDER_REQUIRED");
        }
        ProviderTemplate provider = findProvider(providerKey);
        String apiKey = environment.getProperty(provider.apiKeyEnvName());
        if (isBlank(apiKey)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "MISSING_PROVIDER_CREDENTIAL");
        }
        String resolvedModelId = isBlank(modelId) ? provider.defaultModel() : modelId;
        return new LlmProviderInvocationConfig(
                provider.providerKey(),
                provider.baseUrl(),
                resolvedModelId,
                provider.apiKeyEnvName(),
                apiKey);
    }

    private ModelProviderResponse toResponse(ProviderTemplate provider) {
        return new ModelProviderResponse(
                provider.providerKey(),
                provider.displayName(),
                provider.baseUrl(),
                provider.defaultModel(),
                provider.apiKeyEnvName(),
                provider.enabled(),
                resolveCredentialStatus(provider.apiKeyEnvName()),
                CONNECTION_UNTESTED);
    }

    private ProviderTemplate findProvider(String providerKey) {
        return providerTemplates.stream()
                .filter(provider -> provider.providerKey().equals(providerKey))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Unknown model provider: " + providerKey));
    }

    private String resolveCredentialStatus(String apiKeyEnvName) {
        String value = environment.getProperty(apiKeyEnvName);
        return isBlank(value) ? CREDENTIAL_MISSING : CREDENTIAL_CONFIGURED;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private long elapsedMillis(Instant startedAt) {
        return Duration.between(startedAt, Instant.now()).toMillis();
    }

    private String safeErrorType(String value, String fallback) {
        if (isBlank(value)) {
            return fallback;
        }
        return value.replace('\r', ' ').replace('\n', ' ').trim();
    }

    private record ProviderTemplate(
            String providerKey,
            String displayName,
            String baseUrl,
            String defaultModel,
            String apiKeyEnvName,
            boolean enabled) {
    }
}
