package org.footballlab.llm;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.llm.domain.LlmChatRequest;
import org.footballlab.llm.domain.LlmHttpRequest;
import org.footballlab.llm.domain.LlmHttpResponse;
import org.footballlab.llm.service.LlmHttpTransport;
import org.footballlab.llm.service.OpenAiCompatibleLlmClient;
import org.junit.jupiter.api.Test;

class OpenAiCompatibleLlmClientTest {

    @Test
    void shouldSendOpenAiCompatibleChatCompletionRequestWithoutExposingApiKey() {
        CapturingTransport transport = new CapturingTransport("""
                {
                  "choices": [
                    {
                      "message": {
                        "content": "{\\"parameterUsage\\":{},\\"scorePredictions\\":[],\\"upsetFocus\\":[],\\"stableMatches\\":[],\\"ticketGroups\\":[],\\"finalDecision\\":{},\\"ledgerSnapshot\\":{},\\"complianceNotice\\":\\"非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议。\\"}"
                      }
                    }
                  ],
                  "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 20,
                    "total_tokens": 30
                  }
                }
                """);
        OpenAiCompatibleLlmClient client = new OpenAiCompatibleLlmClient(new ObjectMapper(), transport);

        var response = client.createChatCompletion(new LlmChatRequest(
                "openai",
                "https://api.openai.com/v1",
                "unit-test-secret",
                "gpt-4o-mini",
                "system prompt",
                "user prompt"));

        assertThat(response.content()).contains("parameterUsage");
        assertThat(response.promptTokens()).isEqualTo(10);
        assertThat(response.completionTokens()).isEqualTo(20);
        assertThat(response.totalTokens()).isEqualTo(30);
        assertThat(transport.capturedRequest.url()).isEqualTo("https://api.openai.com/v1/chat/completions");
        assertThat(transport.capturedRequest.authorizationHeader()).isEqualTo("Bearer unit-test-secret");
        assertThat(transport.capturedRequest.body())
                .contains("\"model\":\"gpt-4o-mini\"")
                .contains("\"role\":\"system\"")
                .contains("\"role\":\"user\"")
                .contains("\"response_format\":{\"type\":\"json_object\"}");
        assertThat(transport.capturedRequest.toString()).doesNotContain("unit-test-secret");
    }

    private static final class CapturingTransport implements LlmHttpTransport {
        private final String responseBody;
        private LlmHttpRequest capturedRequest;

        private CapturingTransport(String responseBody) {
            this.responseBody = responseBody;
        }

        @Override
        public LlmHttpResponse exchange(LlmHttpRequest request) {
            capturedRequest = request;
            return new LlmHttpResponse(200, responseBody, 42);
        }
    }
}
