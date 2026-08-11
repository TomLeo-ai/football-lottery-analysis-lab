package org.footballlab.plan.repository;

import java.util.List;
import java.util.Optional;

import org.footballlab.plan.domain.SimulatedPlanResponse;

public interface SimulatedPlanRepository {

    void savePlan(SimulatedPlanResponse plan);

    Optional<SimulatedPlanResponse> findPlan(String planId);

    List<SimulatedPlanResponse> listSavedPlans();

    long nextPlanSequence();

    long nextPlanItemSequence();
}
