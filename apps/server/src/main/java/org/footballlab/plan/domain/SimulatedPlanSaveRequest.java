package org.footballlab.plan.domain;

public record SimulatedPlanSaveRequest(
        String generatedPlanId,
        String operatorNote) {
}
