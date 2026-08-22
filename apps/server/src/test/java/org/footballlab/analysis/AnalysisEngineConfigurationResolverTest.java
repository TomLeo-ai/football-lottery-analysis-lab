package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.footballlab.analysis.service.AnalysisEngineConfigurationResolver;
import org.footballlab.analysis.service.MockRuleAnalysisEngine;
import org.footballlab.analysis.service.OpenAiCompatibleAnalysisEngine;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class AnalysisEngineConfigurationResolverTest {

    private final AnalysisEngineConfigurationResolver resolver = new AnalysisEngineConfigurationResolver();

    @Test
    void shouldResolveBlankEngineToMockWithoutLlmFields() {
        var resolved = resolver.resolve(null, null, null, null);

        assertThat(resolved.engineMode()).isEqualTo(MockRuleAnalysisEngine.ENGINE_MODE);
        assertThat(resolved.providerKey()).isNull();
        assertThat(resolved.modelId()).isNull();
        assertThat(resolved.promptVersion()).isNull();
    }

    @Test
    void shouldRejectMockEngineWithLlmFields() {
        assertThatThrownBy(() -> resolver.resolve(
                        MockRuleAnalysisEngine.ENGINE_MODE,
                        "openai",
                        null,
                        null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("must not include providerKey");
    }

    @Test
    void shouldResolveOpenAiCompatibleWithExplicitProviderModelAndDefaultPrompt() {
        var resolved = resolver.resolve(
                OpenAiCompatibleAnalysisEngine.ENGINE_MODE,
                " openai ",
                " gpt-4o-mini ",
                null);

        assertThat(resolved.engineMode()).isEqualTo(OpenAiCompatibleAnalysisEngine.ENGINE_MODE);
        assertThat(resolved.providerKey()).isEqualTo("openai");
        assertThat(resolved.modelId()).isEqualTo("gpt-4o-mini");
        assertThat(resolved.promptVersion()).isEqualTo(AnalysisEngineConfigurationResolver.DEFAULT_PROMPT_VERSION);
    }

    @Test
    void shouldRejectUnsupportedOpenAiCompatibleConfiguration() {
        assertThatThrownBy(() -> resolver.resolve(
                        OpenAiCompatibleAnalysisEngine.ENGINE_MODE,
                        "openai",
                        "",
                        null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("modelId");

        assertThatThrownBy(() -> resolver.resolve(
                        OpenAiCompatibleAnalysisEngine.ENGINE_MODE,
                        "openai",
                        "gpt-4o-mini",
                        "custom-prompt"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("promptVersion");
    }

    @Test
    void shouldRejectUseGlobalOrUnknownModes() {
        assertThatThrownBy(() -> resolver.resolve("USE_GLOBAL", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unsupported engineMode");

        assertThatThrownBy(() -> resolver.resolve("UNKNOWN", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unsupported engineMode");
    }
}
