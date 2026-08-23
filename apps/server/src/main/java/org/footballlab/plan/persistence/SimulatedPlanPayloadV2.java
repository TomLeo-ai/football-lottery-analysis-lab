package org.footballlab.plan.persistence;

import java.math.BigDecimal;
import java.util.List;

import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanSnapshotResponse;
import org.footballlab.strategy.domain.StrategyParameterRequest;

public record SimulatedPlanPayloadV2(
        String schemaVersion,
        String workflowId,
        String authorityType,
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

    public static final String SCHEMA_VERSION = "SIMULATED_PLAN_V2";

    public SimulatedPlanPayloadV2 {
        statusFlow = statusFlow == null ? null : List.copyOf(statusFlow);
        items = items == null ? null : List.copyOf(items);
    }
}
