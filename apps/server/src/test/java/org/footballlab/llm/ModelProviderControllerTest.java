package org.footballlab.llm;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.footballlab.llm.domain.LlmHttpResponse;
import org.footballlab.llm.service.LlmHttpTransport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "DEEPSEEK_API_KEY=unit-test-secret",
        "OPENAI_API_KEY="
})
class ModelProviderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private LlmHttpTransport llmHttpTransport;

    @Test
    void shouldListProviderStatusWithoutReturningSecretValues() throws Exception {
        mockMvc.perform(get("/api/model-providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].providerKey").value("openai"))
                .andExpect(jsonPath("$.data[0].credentialStatus").value("MISSING"))
                .andExpect(jsonPath("$.data[2].providerKey").value("deepseek"))
                .andExpect(jsonPath("$.data[2].defaultModel").value("deepseek-v4-pro"))
                .andExpect(jsonPath("$.data[2].credentialStatus").value("CONFIGURED"))
                .andExpect(jsonPath("$.data[2].connectionStatus").value("UNTESTED"))
                .andExpect(content().string(not(containsString("unit-test-secret"))));
    }

    @Test
    void shouldReturnSafeConnectionTestResultForMissingCredential() throws Exception {
        String request = """
                {
                  "providerKey": "openai",
                  "modelId": "gpt-4o-mini"
                }
                """;

        mockMvc.perform(post("/api/model-providers/test")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.providerKey").value("openai"))
                .andExpect(jsonPath("$.data.modelId").value("gpt-4o-mini"))
                .andExpect(jsonPath("$.data.connectionStatus").value("SKIPPED"))
                .andExpect(jsonPath("$.data.errorType").value("MISSING_CREDENTIAL"))
                .andExpect(jsonPath("$.data.latencyMs").isNumber())
                .andExpect(content().string(not(containsString("unit-test-secret"))));
    }

    @Test
    void shouldRunSafeConnectionTestForConfiguredCredential() throws Exception {
        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(
                        200,
                        """
                                {
                                  "choices": [
                                    {
                                      "message": {
                                        "content": "{\\"ok\\":true}"
                                      }
                                    }
                                  ],
                                  "usage": {
                                    "prompt_tokens": 1,
                                    "completion_tokens": 1,
                                    "total_tokens": 2
                                  }
                                }
                                """,
                        42));

        String request = """
                {
                  "providerKey": "deepseek",
                  "modelId": "deepseek-v4-pro"
                }
                """;

        mockMvc.perform(post("/api/model-providers/test")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.providerKey").value("deepseek"))
                .andExpect(jsonPath("$.data.modelId").value("deepseek-v4-pro"))
                .andExpect(jsonPath("$.data.connectionStatus").value("CONNECTED"))
                .andExpect(jsonPath("$.data.errorType").value("NONE"))
                .andExpect(jsonPath("$.data.latencyMs").isNumber())
                .andExpect(content().string(not(containsString("unit-test-secret"))));

        verify(llmHttpTransport).exchange(any());
    }

    @Test
    void shouldReturnSanitizedFailureForConfiguredProviderConnectionTest() throws Exception {
        when(llmHttpTransport.exchange(any()))
                .thenReturn(new LlmHttpResponse(
                        401,
                        """
                                {
                                  "error": {
                                    "message": "provider raw response should stay hidden",
                                    "type": "invalid_api_key"
                                  }
                                }
                                """,
                        38));

        String request = """
                {
                  "providerKey": "deepseek",
                  "modelId": "deepseek-v4-pro"
                }
                """;

        mockMvc.perform(post("/api/model-providers/test")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.providerKey").value("deepseek"))
                .andExpect(jsonPath("$.data.modelId").value("deepseek-v4-pro"))
                .andExpect(jsonPath("$.data.connectionStatus").value("FAILED"))
                .andExpect(jsonPath("$.data.errorType").value("LLM_HTTP_STATUS:401"))
                .andExpect(jsonPath("$.data.latencyMs").isNumber())
                .andExpect(content().string(not(containsString("unit-test-secret"))))
                .andExpect(content().string(not(containsString("provider raw response should stay hidden"))))
                .andExpect(content().string(not(containsString("invalid_api_key"))));
    }


    @Test
    void shouldKeepMockRuleEngineAsDefaultEngineSetting() throws Exception {
        mockMvc.perform(get("/api/engine-settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.defaultEngineMode").value("MOCK_RULE_ENGINE"))
                .andExpect(jsonPath("$.data.analysisEngineMode").value("MOCK_RULE_ENGINE"))
                .andExpect(jsonPath("$.data.reviewInsightMode").value("RULE_REVIEW_ONLY"));

        String request = """
                {
                  "analysisEngineMode": "OPENAI_COMPATIBLE",
                  "reviewInsightMode": "RULE_REVIEW_WITH_LLM_INSIGHT"
                }
                """;

        mockMvc.perform(put("/api/engine-settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.defaultEngineMode").value("MOCK_RULE_ENGINE"))
                .andExpect(jsonPath("$.data.analysisEngineMode").value("OPENAI_COMPATIBLE"))
                .andExpect(jsonPath("$.data.reviewInsightMode").value("RULE_REVIEW_WITH_LLM_INSIGHT"));
    }
}
