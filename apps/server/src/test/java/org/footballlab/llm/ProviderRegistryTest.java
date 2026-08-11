package org.footballlab.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.footballlab.llm.service.LlmProviderRegistry;
import org.footballlab.llm.service.OpenAiCompatibleLlmClient;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class ProviderRegistryTest {

    @Test
    void shouldRegisterOpenAiCompatibleProviderTemplatesWithoutExposingCredentials() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("DEEPSEEK_API_KEY", "unit-test-secret");
        LlmProviderRegistry registry = new LlmProviderRegistry(environment, mock(OpenAiCompatibleLlmClient.class));

        var providers = registry.listProviders();

        assertThat(providers)
                .hasSize(11)
                .extracting("providerKey")
                .containsExactly(
                        "openai",
                        "azure-openai",
                        "deepseek",
                        "dashscope-qwen",
                        "zhipu-glm",
                        "volcengine-ark",
                        "moonshot-kimi",
                        "gemini-openai",
                        "openrouter",
                        "litellm-proxy",
                        "local-openai-compatible");
        assertThat(providers)
                .filteredOn(provider -> provider.providerKey().equals("deepseek"))
                .singleElement()
                .satisfies(provider -> {
                    assertThat(provider.credentialStatus()).isEqualTo("CONFIGURED");
                    assertThat(provider.connectionStatus()).isEqualTo("UNTESTED");
                    assertThat(provider.apiKeyEnvName()).isEqualTo("DEEPSEEK_API_KEY");
                    assertThat(provider.defaultModel()).isEqualTo("deepseek-v4-pro");
                    assertThat(provider.toString()).doesNotContain("unit-test-secret");
                });
        assertThat(providers)
                .filteredOn(provider -> provider.providerKey().equals("openai"))
                .singleElement()
                .extracting("credentialStatus")
                .isEqualTo("MISSING");
    }
}
