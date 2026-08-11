package org.footballlab.plan.domain;

import java.math.BigDecimal;
import java.util.List;

import org.footballlab.strategy.domain.StrategyParameterRequest;

public record SimulatedPlanResponse(
        String planId,
        String planType,
        String planStatus,
        String reportId,
        String snapshotId,
        String currency,
        BigDecimal budgetAmount,
        StrategyParameterRequest strategyParameters,
        List<String> statusFlow,
        List<SimulatedPlanItemResponse> items,
        SimulatedPlanSnapshotResponse snapshot,
        String complianceNotice,
        String operatorNote,
        String createdAt,
        String updatedAt) {
}
