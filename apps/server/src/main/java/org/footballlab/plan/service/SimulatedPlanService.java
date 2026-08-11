package org.footballlab.plan.service;

import java.util.List;

import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSaveRequest;
import org.footballlab.plan.domain.StrategySimulationRequest;

public interface SimulatedPlanService {

    SimulatedPlanResponse simulate(StrategySimulationRequest request);

    SimulatedPlanResponse save(SimulatedPlanSaveRequest request);

    List<SimulatedPlanResponse> listSavedPlans();

    SimulatedPlanResponse getSavedPlan(String planId);
}
