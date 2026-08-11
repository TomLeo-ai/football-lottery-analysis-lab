package org.footballlab.review.service;

import org.footballlab.llm.domain.LlmChatRequest;
import org.footballlab.llm.domain.LlmChatResponse;
import org.footballlab.llm.domain.LlmProviderInvocationConfig;
import org.footballlab.llm.domain.ReviewInsightValidationResult;
import org.footballlab.llm.service.LlmInvocationAuditService;
import org.footballlab.llm.service.LlmOutputValidator;
import org.footballlab.llm.service.LlmProviderRegistry;
import org.footballlab.llm.service.OpenAiCompatibleLlmClient;
import org.footballlab.llm.service.PromptContextBuilder;
import org.footballlab.llm.service.PromptPackService;
import org.footballlab.review.domain.ReviewInsightContext;
import org.footballlab.review.domain.ReviewInsightResponse;
import org.footballlab.review.domain.ReviewSettleRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class OpenAiCompatibleReviewInsightEngine implements ReviewInsightEngine {

    public static final String ENGINE_MODE = "RULE_REVIEW_WITH_LLM_INSIGHT";

    private static final String DEFAULT_PROMPT_VERSION = "danche-review-insight-v1";
    private static final String SAFETY_PROMPT_VERSION = "danche-safety-guard-v1";

    private final LlmProviderRegistry providerRegistry;
    private final PromptPackService promptPackService;
    private final PromptContextBuilder promptContextBuilder;
    private final OpenAiCompatibleLlmClient llmClient;
    private final LlmOutputValidator outputValidator;
    private final LlmInvocationAuditService auditService;

    public OpenAiCompatibleReviewInsightEngine(
            LlmProviderRegistry providerRegistry,
            PromptPackService promptPackService,
            PromptContextBuilder promptContextBuilder,
            OpenAiCompatibleLlmClient llmClient,
            LlmOutputValidator outputValidator,
            LlmInvocationAuditService auditService) {
        this.providerRegistry = providerRegistry;
        this.promptPackService = promptPackService;
        this.promptContextBuilder = promptContextBuilder;
        this.llmClient = llmClient;
        this.outputValidator = outputValidator;
        this.auditService = auditService;
    }

    @Override
    public String reviewEngineMode() {
        return ENGINE_MODE;
    }

    @Override
    public ReviewInsightResponse generate(ReviewInsightContext context) {
        ReviewSettleRequest request = context.request();
        String promptVersion = resolvePromptVersion(request.promptVersion());
        LlmProviderInvocationConfig provider = providerRegistry.resolveInvocationConfig(
                request.providerKey(),
                request.modelId());
        String systemPrompt = promptPackService.loadPrompt(SAFETY_PROMPT_VERSION)
                + "\n\n"
                + promptPackService.loadPrompt(promptVersion);
        String userPrompt = "promptVersion=%s\n%s".formatted(
                promptVersion,
                promptContextBuilder.buildReviewInsightContext(context.plan(), context.ruleReviewRecord()));
        String inputPayload = systemPrompt + "\n\n" + userPrompt;

        LlmChatResponse chatResponse = null;
        try {
            chatResponse = llmClient.createChatCompletion(new LlmChatRequest(
                    provider.providerKey(),
                    provider.baseUrl(),
                    provider.apiKey(),
                    provider.modelId(),
                    systemPrompt,
                    userPrompt));
            ReviewInsightValidationResult validationResult = outputValidator.validateReviewInsightOutput(
                    chatResponse.content());
            String auditId = auditService.recordSuccess(
                    LlmInvocationAuditService.BUSINESS_REVIEW_INSIGHT,
                    context.plan().planId(),
                    provider,
                    promptVersion,
                    inputPayload,
                    chatResponse,
                    validationResult.safetyStatus());

            return new ReviewInsightResponse(
                    ENGINE_MODE,
                    provider.providerKey(),
                    provider.modelId(),
                    promptVersion,
                    validationResult.safetyStatus(),
                    auditId,
                    validationResult.output());
        } catch (ResponseStatusException exception) {
            recordFailureAudit(context, provider, promptVersion, inputPayload, chatResponse, exception);
            throw exception;
        }
    }

    private void recordFailureAudit(
            ReviewInsightContext context,
            LlmProviderInvocationConfig provider,
            String promptVersion,
            String inputPayload,
            LlmChatResponse chatResponse,
            ResponseStatusException exception) {
        String safetyStatus = chatResponse == null
                ? LlmInvocationAuditService.SAFETY_ERROR
                : LlmInvocationAuditService.SAFETY_BLOCKED;
        auditService.recordFailure(
                LlmInvocationAuditService.BUSINESS_REVIEW_INSIGHT,
                context.plan().planId(),
                provider,
                promptVersion,
                inputPayload,
                chatResponse == null ? null : chatResponse.content(),
                chatResponse == null ? null : chatResponse.promptTokens(),
                chatResponse == null ? null : chatResponse.completionTokens(),
                chatResponse == null ? null : chatResponse.totalTokens(),
                chatResponse == null ? null : chatResponse.latencyMs(),
                safetyStatus,
                resolveErrorCode(exception));
    }

    private String resolveErrorCode(ResponseStatusException exception) {
        return exception.getReason() == null ? exception.getStatusCode().toString() : exception.getReason();
    }

    private String resolvePromptVersion(String requestedPromptVersion) {
        return requestedPromptVersion == null || requestedPromptVersion.isBlank()
                ? DEFAULT_PROMPT_VERSION
                : requestedPromptVersion;
    }
}
