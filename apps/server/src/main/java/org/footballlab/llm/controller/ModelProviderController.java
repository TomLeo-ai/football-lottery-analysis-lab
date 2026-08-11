package org.footballlab.llm.controller;

import java.util.List;

import org.footballlab.common.Result;
import org.footballlab.llm.domain.ModelProviderConnectionTestResponse;
import org.footballlab.llm.domain.ModelProviderResponse;
import org.footballlab.llm.domain.ModelProviderTestRequest;
import org.footballlab.llm.service.LlmProviderRegistry;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/model-providers")
public class ModelProviderController {

    private final LlmProviderRegistry llmProviderRegistry;

    public ModelProviderController(LlmProviderRegistry llmProviderRegistry) {
        this.llmProviderRegistry = llmProviderRegistry;
    }

    @GetMapping
    public Result<List<ModelProviderResponse>> listProviders() {
        return Result.success(llmProviderRegistry.listProviders());
    }

    @PostMapping("/test")
    public Result<ModelProviderConnectionTestResponse> testProvider(
            @RequestBody ModelProviderTestRequest request) {
        return Result.success(llmProviderRegistry.testConnection(request.providerKey(), request.modelId()));
    }
}
