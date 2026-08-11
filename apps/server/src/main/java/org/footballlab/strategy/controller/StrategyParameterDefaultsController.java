package org.footballlab.strategy.controller;

import org.footballlab.common.Result;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.footballlab.strategy.service.StrategyParameterDefaultsService;
import org.footballlab.strategy.service.StrategyParameterValidator;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/strategy-parameter-defaults")
public class StrategyParameterDefaultsController {

    private final StrategyParameterDefaultsService defaultsService;
    private final StrategyParameterValidator validator;

    public StrategyParameterDefaultsController(
            StrategyParameterDefaultsService defaultsService,
            StrategyParameterValidator validator) {
        this.defaultsService = defaultsService;
        this.validator = validator;
    }

    @GetMapping
    public Result<StrategyParameterRequest> getDefaults() {
        return Result.success(defaultsService.getDefaults());
    }

    @PutMapping
    public Result<StrategyParameterRequest> updateDefaults(@RequestBody StrategyParameterRequest request) {
        return Result.success(defaultsService.updateDefaults(validator.resolve(request)));
    }
}
