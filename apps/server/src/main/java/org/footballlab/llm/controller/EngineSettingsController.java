package org.footballlab.llm.controller;

import org.footballlab.common.Result;
import org.footballlab.llm.domain.EngineSettingsRequest;
import org.footballlab.llm.domain.EngineSettingsResponse;
import org.footballlab.llm.service.EngineSettingsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/engine-settings")
public class EngineSettingsController {

    private final EngineSettingsService engineSettingsService;

    public EngineSettingsController(EngineSettingsService engineSettingsService) {
        this.engineSettingsService = engineSettingsService;
    }

    @GetMapping
    public Result<EngineSettingsResponse> getSettings() {
        return Result.success(engineSettingsService.getSettings());
    }

    @PutMapping
    public Result<EngineSettingsResponse> updateSettings(@RequestBody EngineSettingsRequest request) {
        return Result.success(engineSettingsService.updateSettings(request));
    }
}
