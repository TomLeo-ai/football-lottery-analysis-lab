package org.footballlab.plan.persistence;

import java.util.List;

import org.footballlab.plan.domain.SimulatedPlanResponse;

public final class LegacySimulatedPlanAdapter {

    private LegacySimulatedPlanAdapter() {
    }

    public static SimulatedPlanResponse adapt(SimulatedPlanResponse legacyPlan) {
        if (legacyPlan == null) {
            throw new IllegalArgumentException("legacyPlan must not be null.");
        }
        return new SimulatedPlanResponse(
                legacyPlan.planId(),
                legacyPlan.planType(),
                legacyPlan.planStatus(),
                legacyPlan.reportId(),
                legacyPlan.snapshotId(),
                legacyPlan.currency(),
                legacyPlan.budgetAmount(),
                legacyPlan.strategyParameters(),
                legacyPlan.statusFlow() == null ? null : List.copyOf(legacyPlan.statusFlow()),
                legacyPlan.items() == null ? null : List.copyOf(legacyPlan.items()),
                legacyPlan.snapshot(),
                legacyPlan.complianceNotice(),
                legacyPlan.operatorNote(),
                legacyPlan.createdAt(),
                legacyPlan.updatedAt());
    }
}
