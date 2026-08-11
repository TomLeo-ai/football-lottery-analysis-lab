package org.footballlab.plan.controller;

import java.util.List;

import org.footballlab.common.Result;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSaveRequest;
import org.footballlab.plan.domain.StrategySimulationRequest;
import org.footballlab.plan.service.SimulatedPlanService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class SimulatedPlanController {

    private final SimulatedPlanService simulatedPlanService;

    public SimulatedPlanController(SimulatedPlanService simulatedPlanService) {
        this.simulatedPlanService = simulatedPlanService;
    }

    @PostMapping("/strategies/simulate")
    public Result<SimulatedPlanResponse> simulate(@RequestBody StrategySimulationRequest request) {
        return Result.success(simulatedPlanService.simulate(request));
    }

    @PostMapping("/simulated-plans")
    public Result<SimulatedPlanResponse> save(@RequestBody SimulatedPlanSaveRequest request) {
        return Result.success(simulatedPlanService.save(request));
    }

    @GetMapping("/simulated-plans")
    public Result<List<SimulatedPlanResponse>> list() {
        return Result.success(simulatedPlanService.listSavedPlans());
    }

    @GetMapping("/simulated-plans/{planId}")
    public Result<SimulatedPlanResponse> detail(@PathVariable String planId) {
        return Result.success(simulatedPlanService.getSavedPlan(planId));
    }
}
