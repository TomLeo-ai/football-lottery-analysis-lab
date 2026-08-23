package org.footballlab.plan.controller;

import java.util.List;

import org.footballlab.common.Result;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSaveRequest;
import org.footballlab.plan.domain.StrategySimulationRequest;
import org.footballlab.plan.service.SimulatedPlanService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class SimulatedPlanController {

    private final SimulatedPlanService simulatedPlanService;

    public SimulatedPlanController(SimulatedPlanService simulatedPlanService) {
        this.simulatedPlanService = simulatedPlanService;
    }

    @PostMapping("/strategies/simulate")
    public ResponseEntity<Result<SimulatedPlanResponse>> simulate(
            @RequestBody StrategySimulationRequest request,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        SimulatedPlanService.PlanMutationResult mutation = simulatedPlanService.simulate(request, idempotencyKey);
        return ResponseEntity
                .status(mutation.httpStatus())
                .body(Result.success(mutation.httpStatus().value(), mutation.plan()));
    }

    @PostMapping("/simulated-plans")
    public ResponseEntity<Result<SimulatedPlanResponse>> save(
            @RequestBody SimulatedPlanSaveRequest request,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        SimulatedPlanService.PlanMutationResult mutation = simulatedPlanService.save(request, idempotencyKey);
        return ResponseEntity
                .status(mutation.httpStatus())
                .body(Result.success(mutation.httpStatus().value(), mutation.plan()));
    }

    @GetMapping("/simulated-plans")
    public Result<List<SimulatedPlanResponse>> list() {
        return Result.success(simulatedPlanService.listSavedPlans());
    }

    @GetMapping("/simulated-plans/{planId}")
    public Result<SimulatedPlanResponse> detail(@PathVariable String planId) {
        return Result.success(simulatedPlanService.getPlanDetail(planId));
    }
}
