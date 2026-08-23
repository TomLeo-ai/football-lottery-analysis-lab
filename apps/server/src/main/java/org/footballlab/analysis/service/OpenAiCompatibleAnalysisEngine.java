package org.footballlab.analysis.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import org.footballlab.analysis.domain.AnalysisMarketRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.RiskWarningResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.llm.domain.LlmChatRequest;
import org.footballlab.llm.domain.LlmChatResponse;
import org.footballlab.llm.domain.LlmInvocationAuditRecord;
import org.footballlab.llm.domain.LlmProviderInvocationConfig;
import org.footballlab.llm.domain.PredictionValidationResult;
import org.footballlab.llm.service.LlmInvocationAuditService;
import org.footballlab.llm.service.LlmOutputValidator;
import org.footballlab.llm.service.LlmProviderRegistry;
import org.footballlab.llm.service.OpenAiCompatibleLlmClient;
import org.footballlab.llm.service.PromptContextBuilder;
import org.footballlab.llm.service.PromptPackService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class OpenAiCompatibleAnalysisEngine implements AnalysisEngine {

    public static final String ENGINE_MODE = "OPENAI_COMPATIBLE";

    private static final String SAFETY_PROMPT_VERSION = "danche-safety-guard-v1";
    private static final String REPORT_STATUS = "GENERATED";

    private final LlmProviderRegistry providerRegistry;
    private final PromptPackService promptPackService;
    private final PromptContextBuilder promptContextBuilder;
    private final OpenAiCompatibleLlmClient llmClient;
    private final LlmOutputValidator outputValidator;
    private final LlmInvocationAuditService auditService;

    public OpenAiCompatibleAnalysisEngine(
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
    public String engineMode() {
        return ENGINE_MODE;
    }

    @Override
    public AnalysisEngineResult generate(AnalysisEngineContext context) {
        AuthoritativeAnalysisInput input = context.input();
        String promptVersion = context.engineConfiguration().promptVersion();
        LlmProviderInvocationConfig provider = null;
        LlmChatResponse chatResponse = null;
        String inputPayload = "prediction-input-unavailable";
        try {
            String systemPrompt = promptPackService.loadPrompt(SAFETY_PROMPT_VERSION)
                    + "\n\n"
                    + promptPackService.loadPrompt(promptVersion);
            String userPrompt = "promptVersion=%s\n%s".formatted(
                    promptVersion,
                    promptContextBuilder.buildPredictionContext(input, context.strategyParameters()));
            inputPayload = systemPrompt + "\n\n" + userPrompt;
            provider = providerRegistry.resolveInvocationConfig(
                    context.engineConfiguration().providerKey(),
                    context.engineConfiguration().modelId());
            chatResponse = llmClient.createChatCompletion(new LlmChatRequest(
                    provider.providerKey(),
                    provider.baseUrl(),
                    provider.apiKey(),
                    provider.modelId(),
                    systemPrompt,
                    userPrompt));
            PredictionValidationResult validationResult = outputValidator.validatePredictionOutput(
                    chatResponse.content(),
                    context.strategyParameters(),
                    input.markets());
            JsonNode llmOutput = validationResult.output();
            LlmInvocationAuditRecord audit = auditService.buildSuccessRecord(
                    LlmInvocationAuditService.BUSINESS_ANALYSIS_PREDICTION,
                    context.reportId(),
                    provider,
                    promptVersion,
                    inputPayload,
                    chatResponse,
                    validationResult.safetyStatus());

            return new AnalysisEngineResult(new AnalysisReportResponse(
                    context.reportId(),
                    input.snapshotId(),
                    input.sourceType(),
                    ENGINE_MODE,
                    REPORT_STATUS,
                    context.strategyParameters(),
                    buildProbabilityAnalysis(input, llmOutput),
                    buildRiskWarnings(chatResponse.latencyMs(), chatResponse.totalTokens()),
                    buildSimulatedSelections(input, llmOutput),
                    llmOutput.path("complianceNotice").asText(),
                    context.generatedAt(),
                    provider.providerKey(),
                    provider.modelId(),
                    promptVersion,
                    validationResult.safetyStatus(),
                    audit.auditId(),
                    llmOutput), audit);
        } catch (ResponseStatusException exception) {
            LlmProviderInvocationConfig auditProvider = provider == null
                    ? new LlmProviderInvocationConfig(
                            context.engineConfiguration().providerKey(),
                            null,
                            context.engineConfiguration().modelId(),
                            null,
                            null)
                    : provider;
            LlmInvocationAuditRecord failureAudit = buildFailureAudit(
                    context, auditProvider, promptVersion, inputPayload, chatResponse, exception);
            HttpStatus status = HttpStatus.resolve(exception.getStatusCode().value());
            throw new AnalysisEngineInvocationException(
                    status == null ? HttpStatus.INTERNAL_SERVER_ERROR : status,
                    resolveErrorCode(exception),
                    "External analysis could not be completed safely.",
                    failureAudit);
        }
    }

    private LlmInvocationAuditRecord buildFailureAudit(
            AnalysisEngineContext context,
            LlmProviderInvocationConfig provider,
            String promptVersion,
            String inputPayload,
            LlmChatResponse chatResponse,
            ResponseStatusException exception) {
        String safetyStatus = chatResponse == null
                ? LlmInvocationAuditService.SAFETY_ERROR
                : LlmInvocationAuditService.SAFETY_BLOCKED;
        return auditService.buildFailureRecord(
                LlmInvocationAuditService.BUSINESS_ANALYSIS_PREDICTION,
                context.reportId(),
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
        String reason = exception.getReason();
        if (reason == null || reason.isBlank()) {
            return "LLM_INVOCATION_FAILED";
        }
        if (reason.startsWith("UNSUPPORTED_PLAY_TYPE:")
                || reason.startsWith("UNSUPPORTED_SELECTION:")
                || reason.startsWith("MISSING_FIELD:")
                || reason.startsWith("REVIEW_SETTLEMENT_MUTATION_FIELD:")
                || "INVALID_JSON_OBJECT".equals(reason)
                || "INVALID_JSON".equals(reason)
                || "MISSING_COMPLIANCE_NOTICE".equals(reason)
                || "INVALID_TICKET_GROUPS".equals(reason)
                || "INVALID_TICKET_COST".equals(reason)
                || "MAX_PARLAY_LEGS_EXCEEDED".equals(reason)
                || "INVALID_SELECTIONS".equals(reason)
                || "EXCLUDED_PLAY_TYPE".equals(reason)
                || "INVALID_SELECTION_MARKET".equals(reason)
                || "BUDGET_EXCEEDED".equals(reason)
                || "BLOCKED_TERM".equals(reason)) {
            return "LLM_OUTPUT_VALIDATION_FAILED";
        }
        if (reason.startsWith("LLM_HTTP_STATUS:")) {
            return "LLM_PROVIDER_HTTP_ERROR";
        }
        if (reason.startsWith("Unknown model provider:")) {
            return "MODEL_PROVIDER_UNKNOWN";
        }
        if (reason.startsWith("Prompt not found:") || reason.startsWith("Prompt load failed:")) {
            return "PROMPT_CONFIGURATION_ERROR";
        }
        return switch (reason) {
            case "MODEL_PROVIDER_REQUIRED",
                    "MISSING_PROVIDER_CREDENTIAL",
                    "LLM_HTTP_TIMEOUT",
                    "LLM_HTTP_IO_ERROR",
                    "LLM_HTTP_INTERRUPTED",
                    "LLM_REQUEST_SERIALIZATION_ERROR",
                    "LLM_EMPTY_CONTENT",
                    "LLM_RESPONSE_PARSE_ERROR" -> reason;
            case "Prompt context build failed" -> "PROMPT_CONTEXT_BUILD_FAILED";
            default -> "LLM_INVOCATION_FAILED";
        };
    }

    private List<ProbabilityInsightResponse> buildProbabilityAnalysis(
            AuthoritativeAnalysisInput input,
            JsonNode llmOutput) {
        return input.matches().stream()
                .map(match -> new ProbabilityInsightResponse(
                        match.matchId(),
                        match.matchDate(),
                        match.league(),
                        match.kickoffTime(),
                        match.homeTeam(),
                        match.awayTeam(),
                        firstSelectionForMatch(llmOutput, match.matchId()),
                        "LLM_STRUCTURED",
                        "OpenAI-compatible structured output validated; inspect llmOutput for scorePredictions and finalDecision."))
                .toList();
    }

    private List<RiskWarningResponse> buildRiskWarnings(long latencyMs, int totalTokens) {
        return List.of(new RiskWarningResponse(
                "LLM_OUTPUT_VALIDATED",
                "MEDIUM",
                "OpenAI-compatible output passed JSON, safety, budget, play-type and parlay validation. latencyMs="
                        + latencyMs
                        + ", totalTokens="
                        + totalTokens));
    }

    private List<SimulatedSelectionResponse> buildSimulatedSelections(
            AuthoritativeAnalysisInput input,
            JsonNode llmOutput) {
        List<SimulatedSelectionResponse> selections = new ArrayList<>();
        for (JsonNode ticketGroup : llmOutput.path("ticketGroups")) {
            BigDecimal stakeAmount = ticketGroup.path("cost").isNumber()
                    ? ticketGroup.path("cost").decimalValue()
                    : BigDecimal.ZERO;
            for (JsonNode selection : ticketGroup.path("selections")) {
                String matchId = selection.path("matchId").asText();
                String playType = selection.path("playType").asText();
                String selectedValue = selection.path("selection").asText();
                selections.add(new SimulatedSelectionResponse(
                        matchId,
                        playType,
                        selectedValue,
                        findOdds(input, matchId, playType, selectedValue),
                        stakeAmount,
                        "Structured LLM selection validated against strategyParameters."));
            }
        }
        return selections;
    }

    private String firstSelectionForMatch(JsonNode llmOutput, String matchId) {
        for (JsonNode ticketGroup : llmOutput.path("ticketGroups")) {
            for (JsonNode selection : ticketGroup.path("selections")) {
                if (matchId.equals(selection.path("matchId").asText())) {
                    return selection.path("selection").asText("LLM_SELECTION");
                }
            }
        }
        return "LLM_SELECTION";
    }

    private BigDecimal findOdds(AuthoritativeAnalysisInput input, String matchId, String playType, String selection) {
        return input.markets().stream()
                .filter(market -> sameMarket(market, matchId, playType, selection))
                .findFirst()
                .map(AnalysisMarketRequest::odds)
                .orElse(BigDecimal.ZERO);
    }

    private boolean sameMarket(AnalysisMarketRequest market, String matchId, String playType, String selection) {
        return matchId.equals(market.matchId())
                && playType.equals(market.playType())
                && selection.equals(market.selection());
    }
}
