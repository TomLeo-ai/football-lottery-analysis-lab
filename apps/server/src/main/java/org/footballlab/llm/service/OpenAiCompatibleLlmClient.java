package org.footballlab.llm.service;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.llm.domain.LlmChatRequest;
import org.footballlab.llm.domain.LlmChatResponse;
import org.footballlab.llm.domain.LlmHttpRequest;
import org.footballlab.llm.domain.LlmHttpResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OpenAiCompatibleLlmClient {

    private final ObjectMapper objectMapper;
    private final LlmHttpTransport transport;

    public OpenAiCompatibleLlmClient(ObjectMapper objectMapper, LlmHttpTransport transport) {
        this.objectMapper = objectMapper;
        this.transport = transport;
    }

    public LlmChatResponse createChatCompletion(LlmChatRequest request) {
        LlmHttpResponse response = transport.exchange(new LlmHttpRequest(
                endpointUrl(request.baseUrl()),
                "Bearer " + request.apiKey(),
                requestBody(request)));
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "LLM_HTTP_STATUS:" + response.statusCode());
        }
        return parseResponse(response);
    }

    private String endpointUrl(String baseUrl) {
        String normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        return normalizedBaseUrl + "/chat/completions";
    }

    private String requestBody(LlmChatRequest request) {
        Map<String, Object> payload = Map.of(
                "model", request.modelId(),
                "messages", List.of(
                        Map.of("role", "system", "content", request.systemPrompt()),
                        Map.of("role", "user", "content", request.userPrompt())),
                "temperature", 0.2,
                "response_format", Map.of("type", "json_object"));
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "LLM_REQUEST_SERIALIZATION_ERROR", exception);
        }
    }

    private LlmChatResponse parseResponse(LlmHttpResponse response) {
        try {
            JsonNode root = objectMapper.readTree(response.body());
            String content = root.path("choices").path(0).path("message").path("content").asText();
            if (content == null || content.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "LLM_EMPTY_CONTENT");
            }
            JsonNode usage = root.path("usage");
            return new LlmChatResponse(
                    content,
                    usage.path("prompt_tokens").asInt(0),
                    usage.path("completion_tokens").asInt(0),
                    usage.path("total_tokens").asInt(0),
                    response.latencyMs());
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "LLM_RESPONSE_PARSE_ERROR", exception);
        }
    }
}
