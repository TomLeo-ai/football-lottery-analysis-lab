package org.footballlab.plan.persistence;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSnapshotResponse;
import org.footballlab.strategy.domain.StrategyParameterRequest;

public record SimulatedPlanV2Record(
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

    public static final String AUTHORITY_TYPE = "SERVER_GENERATED_PLAN_V2";
    private static final String STATUS_GENERATED = "GENERATED";
    private static final String STATUS_PENDING_RESULT = "PENDING_RESULT";
    private static final String PLAY_TYPE_WIN_DRAW_LOSS = "WIN_DRAW_LOSS";
    private static final Set<String> ALLOWED_SELECTIONS = Set.of("HOME_WIN", "DRAW", "AWAY_WIN");

    public SimulatedPlanV2Record {
        requireText(workflowId, "workflowId");
        requireText(authorityType, "authorityType");
        if (!AUTHORITY_TYPE.equals(authorityType)) {
            throw new IllegalArgumentException("authorityType must identify a server-generated v2 plan.");
        }
        requireText(planId, "planId");
        requireText(planType, "planType");
        requireStatus(planStatus, "planStatus");
        requireText(reportId, "reportId");
        requireText(snapshotId, "snapshotId");
        requireText(currency, "currency");
        requireDecimalScale(budgetAmount, 2, "budgetAmount");
        requireText(complianceNotice, "complianceNotice");
        requireText(createdAt, "createdAt");
        requireText(updatedAt, "updatedAt");
        if (strategyParameters == null) {
            throw new IllegalArgumentException("strategyParameters are required for simulated plan v2.");
        }
        strategyParameters = defensiveStrategyCopy(strategyParameters);
        validateV2Strategy(strategyParameters, budgetAmount, currency);
        statusFlow = requireList(statusFlow, "statusFlow");
        validateStatusFlow(planStatus, statusFlow);
        items = requireList(items, "items");
        if (items.isEmpty()) {
            throw new IllegalArgumentException("items are required for simulated plan v2.");
        }
        validateItems(items);
        items = items.stream()
                .sorted(Comparator.comparing(SimulatedPlanItemResponse::planItemId))
                .toList();
        if (snapshot == null) {
            throw new IllegalArgumentException("snapshot is required for simulated plan v2.");
        }
        snapshot = defensiveSnapshotCopy(snapshot);
        validateSnapshot(snapshot, reportId, snapshotId, planStatus, strategyParameters, items.size());
    }

    public SimulatedPlanResponse toResponse() {
        return new SimulatedPlanResponse(
                planId,
                planType,
                planStatus,
                reportId,
                snapshotId,
                currency,
                budgetAmount,
                strategyParameters,
                statusFlow,
                items,
                snapshot,
                complianceNotice,
                operatorNote,
                createdAt,
                updatedAt);
    }

    public SimulatedPlanPayloadV2 toPayload() {
        return new SimulatedPlanPayloadV2(
                SimulatedPlanPayloadV2.SCHEMA_VERSION,
                workflowId,
                authorityType,
                planId,
                planType,
                planStatus,
                reportId,
                snapshotId,
                currency,
                budgetAmount,
                strategyParameters,
                statusFlow,
                items,
                snapshot,
                complianceNotice,
                operatorNote,
                createdAt,
                updatedAt);
    }

    public SimulatedPlanV2Record toPendingResult(String note, String transitionTime) {
        requireText(transitionTime, "updatedAt");
        if (!STATUS_GENERATED.equals(planStatus)) {
            throw new IllegalStateException("Only a generated simulated plan can transition to pending result.");
        }
        return new SimulatedPlanV2Record(
                workflowId,
                authorityType,
                planId,
                planType,
                STATUS_PENDING_RESULT,
                reportId,
                snapshotId,
                currency,
                budgetAmount,
                strategyParameters,
                List.of(STATUS_GENERATED, "SAVED", STATUS_PENDING_RESULT),
                items,
                new SimulatedPlanSnapshotResponse(
                        snapshot.planSnapshotId(),
                        snapshot.snapshotId(),
                        snapshot.reportId(),
                        snapshot.inputSourceType(),
                        snapshot.engineType(),
                        snapshot.sourceReportStatus(),
                        snapshot.strategyParameters(),
                        snapshot.selectionCount(),
                        STATUS_PENDING_RESULT,
                        snapshot.capturedAt()),
                complianceNotice,
                note,
                createdAt,
                transitionTime);
    }

    private static void validateV2Strategy(
            StrategyParameterRequest strategy,
            BigDecimal budgetAmount,
            String currency) {
        if (!decimalEquals(budgetAmount, strategy.budgetAmount())) {
            throw new IllegalArgumentException("strategy budget must match plan budget for simulated plan v2.");
        }
        requireDecimalScale(strategy.budgetAmount(), 2, "strategyParameters.budgetAmount");
        if (!currency.equals(strategy.currency())) {
            throw new IllegalArgumentException("strategy currency must match plan currency for simulated plan v2.");
        }
        if (!List.of(PLAY_TYPE_WIN_DRAW_LOSS).equals(strategy.preferredPlayTypes())) {
            throw new IllegalArgumentException("preferredPlayTypes must contain only WIN_DRAW_LOSS for simulated plan v2.");
        }
        if (strategy.excludedPlayTypes() == null || !strategy.excludedPlayTypes().isEmpty()) {
            throw new IllegalArgumentException("excludedPlayTypes must be empty for simulated plan v2.");
        }
        if (!"DISABLED".equals(strategy.exactScorePolicy())) {
            throw new IllegalArgumentException("exactScorePolicy must be DISABLED for simulated plan v2.");
        }
    }

    private static void validateStatusFlow(String planStatus, List<String> statusFlow) {
        List<String> expected = STATUS_GENERATED.equals(planStatus)
                ? List.of(STATUS_GENERATED)
                : List.of(STATUS_GENERATED, "SAVED", STATUS_PENDING_RESULT);
        if (!expected.equals(statusFlow)) {
            throw new IllegalArgumentException("statusFlow does not match planStatus for simulated plan v2.");
        }
    }

    private static void validateItems(List<SimulatedPlanItemResponse> items) {
        Set<String> itemIds = new HashSet<>();
        for (SimulatedPlanItemResponse item : items) {
            if (item == null) {
                throw new IllegalArgumentException("items must not contain null values for simulated plan v2.");
            }
            requireText(item.planItemId(), "planItemId");
            requireText(item.matchId(), "matchId");
            if (!itemIds.add(item.planItemId())) {
                throw new IllegalArgumentException("planItemId values must be unique for simulated plan v2.");
            }
            if (!PLAY_TYPE_WIN_DRAW_LOSS.equals(item.playType())) {
                throw new IllegalArgumentException("v2 plan items must use WIN_DRAW_LOSS.");
            }
            if (!ALLOWED_SELECTIONS.contains(item.selection())) {
                throw new IllegalArgumentException("v2 plan item selection must be HOME_WIN, DRAW, or AWAY_WIN.");
            }
            requireDecimalScale(item.odds(), 4, "odds");
            requireDecimalScale(item.stakeAmount(), 2, "stakeAmount");
            if (!STATUS_GENERATED.equals(item.itemStatus())) {
                throw new IllegalArgumentException("v2 plan item status must remain GENERATED.");
            }
        }
    }

    private static void validateSnapshot(
            SimulatedPlanSnapshotResponse snapshot,
            String reportId,
            String snapshotId,
            String planStatus,
            StrategyParameterRequest strategy,
            int selectionCount) {
        requireText(snapshot.planSnapshotId(), "planSnapshotId");
        requireText(snapshot.reportId(), "snapshot.reportId");
        requireText(snapshot.snapshotId(), "snapshot.snapshotId");
        if (!reportId.equals(snapshot.reportId()) || !snapshotId.equals(snapshot.snapshotId())) {
            throw new IllegalArgumentException("snapshot lineage must match the plan header for simulated plan v2.");
        }
        if (snapshot.selectionCount() != selectionCount) {
            throw new IllegalArgumentException("snapshot selectionCount must match plan items for simulated plan v2.");
        }
        if (!planStatus.equals(snapshot.snapshotStatus())) {
            throw new IllegalArgumentException("snapshot status must match planStatus for simulated plan v2.");
        }
        if (!strategyEquivalent(strategy, snapshot.strategyParameters())) {
            throw new IllegalArgumentException("snapshot strategy must match the plan header for simulated plan v2.");
        }
    }

    private static StrategyParameterRequest defensiveStrategyCopy(StrategyParameterRequest strategy) {
        return new StrategyParameterRequest(
                strategy.budgetAmount(),
                strategy.currency(),
                strategy.targetTicketCount(),
                strategy.minTicketCount(),
                strategy.maxTicketCount(),
                strategy.riskPreference(),
                strategy.mainTicketRatio(),
                strategy.defensiveTicketRatio(),
                strategy.entertainmentTicketRatio(),
                strategy.enableEntertainmentTicket(),
                strategy.entertainmentTicketMaxCost(),
                strategy.maxParlayLegs(),
                strategy.preferredPlayTypes() == null ? null : List.copyOf(strategy.preferredPlayTypes()),
                strategy.excludedPlayTypes() == null ? null : List.copyOf(strategy.excludedPlayTypes()),
                strategy.exactScorePolicy(),
                strategy.minPayoutRequirement(),
                strategy.allowLowReturnTicket(),
                strategy.upsetCoverageLevel());
    }

    private static SimulatedPlanSnapshotResponse defensiveSnapshotCopy(SimulatedPlanSnapshotResponse snapshot) {
        return new SimulatedPlanSnapshotResponse(
                snapshot.planSnapshotId(),
                snapshot.snapshotId(),
                snapshot.reportId(),
                snapshot.inputSourceType(),
                snapshot.engineType(),
                snapshot.sourceReportStatus(),
                snapshot.strategyParameters() == null ? null : defensiveStrategyCopy(snapshot.strategyParameters()),
                snapshot.selectionCount(),
                snapshot.snapshotStatus(),
                snapshot.capturedAt());
    }

    private static boolean strategyEquivalent(StrategyParameterRequest first, StrategyParameterRequest second) {
        if (first == null || second == null) {
            return first == second;
        }
        return decimalEquals(first.budgetAmount(), second.budgetAmount())
                && java.util.Objects.equals(first.currency(), second.currency())
                && java.util.Objects.equals(first.targetTicketCount(), second.targetTicketCount())
                && java.util.Objects.equals(first.minTicketCount(), second.minTicketCount())
                && java.util.Objects.equals(first.maxTicketCount(), second.maxTicketCount())
                && java.util.Objects.equals(first.riskPreference(), second.riskPreference())
                && decimalEquals(first.mainTicketRatio(), second.mainTicketRatio())
                && decimalEquals(first.defensiveTicketRatio(), second.defensiveTicketRatio())
                && decimalEquals(first.entertainmentTicketRatio(), second.entertainmentTicketRatio())
                && java.util.Objects.equals(first.enableEntertainmentTicket(), second.enableEntertainmentTicket())
                && decimalEquals(first.entertainmentTicketMaxCost(), second.entertainmentTicketMaxCost())
                && java.util.Objects.equals(first.maxParlayLegs(), second.maxParlayLegs())
                && java.util.Objects.equals(first.preferredPlayTypes(), second.preferredPlayTypes())
                && java.util.Objects.equals(first.excludedPlayTypes(), second.excludedPlayTypes())
                && java.util.Objects.equals(first.exactScorePolicy(), second.exactScorePolicy())
                && decimalEquals(first.minPayoutRequirement(), second.minPayoutRequirement())
                && java.util.Objects.equals(first.allowLowReturnTicket(), second.allowLowReturnTicket())
                && java.util.Objects.equals(first.upsetCoverageLevel(), second.upsetCoverageLevel());
    }

    private static boolean decimalEquals(BigDecimal first, BigDecimal second) {
        return first == null ? second == null : second != null && first.compareTo(second) == 0;
    }

    private static void requireDecimalScale(BigDecimal value, int maximumScale, String fieldName) {
        if (value == null || Math.max(value.scale(), 0) > maximumScale) {
            throw new IllegalArgumentException(fieldName + " must have at most " + maximumScale
                    + " decimal places for simulated plan v2.");
        }
    }

    private static void requireStatus(String value, String fieldName) {
        if (!STATUS_GENERATED.equals(value) && !STATUS_PENDING_RESULT.equals(value)) {
            throw new IllegalArgumentException(fieldName + " must be GENERATED or PENDING_RESULT for simulated plan v2.");
        }
    }

    private static void requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " is required for simulated plan v2.");
        }
    }

    private static <T> List<T> requireList(List<T> value, String fieldName) {
        if (value == null) {
            throw new IllegalArgumentException(fieldName + " is required for simulated plan v2.");
        }
        return List.copyOf(value);
    }
}
