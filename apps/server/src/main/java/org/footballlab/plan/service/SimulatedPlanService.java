package org.footballlab.plan.service;

import java.util.List;

import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSaveRequest;
import org.footballlab.plan.domain.StrategySimulationRequest;
import org.springframework.http.HttpStatus;

public interface SimulatedPlanService {

    PlanMutationResult simulate(StrategySimulationRequest request, String idempotencyKey);

    PlanMutationResult save(SimulatedPlanSaveRequest request, String idempotencyKey);

    List<SimulatedPlanResponse> listSavedPlans();

    SimulatedPlanResponse getPlanDetail(String planId);

    SimulatedPlanResponse getSavedPlan(String planId);

    record PlanMutationResult(HttpStatus httpStatus, SimulatedPlanResponse plan) {
    }
}
