package org.footballlab.plan.domain;

import org.footballlab.strategy.domain.StrategyParameterRequest;

public record SimulatedPlanSnapshotResponse(
        String planSnapshotId,
        String snapshotId,
        String reportId,
        String inputSourceType,
        String engineType,
        String sourceReportStatus,
        StrategyParameterRequest strategyParameters,
        int selectionCount,
        String snapshotStatus,
        String capturedAt) {
}
