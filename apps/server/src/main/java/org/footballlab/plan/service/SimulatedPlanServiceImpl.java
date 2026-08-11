package org.footballlab.plan.service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSaveRequest;
import org.footballlab.plan.domain.SimulatedPlanSnapshotResponse;
import org.footballlab.plan.domain.StrategySimulationRequest;
import org.footballlab.plan.repository.SimulatedPlanRepository;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.footballlab.strategy.service.StrategyParameterValidator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SimulatedPlanServiceImpl implements SimulatedPlanService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final String REQUIRED_SOURCE_TYPE = "USER_SCREENSHOT_CONFIRMED";
    private static final String REQUIRED_REPORT_STATUS = "GENERATED";
    private static final String PLAN_TYPE = "SIMULATED_ONLY";
    private static final String STATUS_GENERATED = "GENERATED";
    private static final String STATUS_SAVED = "SAVED";
    private static final String STATUS_PENDING_RESULT = "PENDING_RESULT";
    private static final String DEFAULT_ENGINE_TYPE = "MOCK_RULE_ENGINE";
    private static final String COMPLIANCE_NOTICE = "非官方，仅模拟保存与复盘流程验证；不构成确定性建议。";

    private final SimulatedPlanRepository simulatedPlanRepository;
    private final StrategyParameterValidator strategyParameterValidator;
    private final AtomicLong planSequence;
    private final AtomicLong itemSequence;
    private final AtomicLong snapshotSequence;

    public SimulatedPlanServiceImpl(
            SimulatedPlanRepository simulatedPlanRepository,
            StrategyParameterValidator strategyParameterValidator) {
        this.simulatedPlanRepository = simulatedPlanRepository;
        this.strategyParameterValidator = strategyParameterValidator;
        long nextPlanSequence = simulatedPlanRepository.nextPlanSequence();
        this.planSequence = new AtomicLong(nextPlanSequence);
        this.itemSequence = new AtomicLong(simulatedPlanRepository.nextPlanItemSequence());
        this.snapshotSequence = new AtomicLong(nextPlanSequence);
    }

    @Override
    public SimulatedPlanResponse simulate(StrategySimulationRequest request) {
        validateSimulationRequest(request);
        StrategyParameterRequest strategyParameters = strategyParameterValidator.resolve(request.strategyParameters());

        String now = now();
        String planId = "sim-plan-%06d".formatted(planSequence.getAndIncrement());
        Map<String, ProbabilityInsightResponse> probabilityByMatchId = buildProbabilityMap(request);
        List<SimulatedPlanItemResponse> items = request.simulatedSelections().stream()
                .map(selection -> buildGeneratedItem(selection, probabilityByMatchId.get(selection.matchId())))
                .toList();
        SimulatedPlanSnapshotResponse snapshot = new SimulatedPlanSnapshotResponse(
                "sim-snapshot-%06d".formatted(snapshotSequence.getAndIncrement()),
                request.snapshotId(),
                request.reportId(),
                request.inputSourceType(),
                resolveEngineType(request.engineType()),
                request.reportStatus(),
                strategyParameters,
                items.size(),
                STATUS_GENERATED,
                now);
        SimulatedPlanResponse generatedPlan = new SimulatedPlanResponse(
                planId,
                PLAN_TYPE,
                STATUS_GENERATED,
                request.reportId(),
                request.snapshotId(),
                request.currency(),
                strategyParameters.budgetAmount(),
                strategyParameters,
                List.of(STATUS_GENERATED),
                items,
                snapshot,
                COMPLIANCE_NOTICE,
                null,
                now,
                now);

        simulatedPlanRepository.savePlan(generatedPlan);
        return generatedPlan;
    }

    @Override
    public SimulatedPlanResponse save(SimulatedPlanSaveRequest request) {
        if (request.generatedPlanId() == null || request.generatedPlanId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "generatedPlanId is required.");
        }

        SimulatedPlanResponse generatedPlan = simulatedPlanRepository.findPlan(request.generatedPlanId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Generated simulated plan not found."));

        String now = now();
        SimulatedPlanResponse savedPlan = new SimulatedPlanResponse(
                generatedPlan.planId(),
                generatedPlan.planType(),
                STATUS_PENDING_RESULT,
                generatedPlan.reportId(),
                generatedPlan.snapshotId(),
                generatedPlan.currency(),
                generatedPlan.budgetAmount(),
                generatedPlan.strategyParameters(),
                List.of(STATUS_GENERATED, STATUS_SAVED, STATUS_PENDING_RESULT),
                generatedPlan.items().stream()
                        .map(item -> new SimulatedPlanItemResponse(
                                item.planItemId(),
                                item.matchId(),
                                item.matchDate(),
                                item.league(),
                                item.homeTeam(),
                                item.awayTeam(),
                                item.kickoffTime(),
                                item.playType(),
                                item.selection(),
                                item.odds(),
                                item.stakeAmount(),
                                STATUS_PENDING_RESULT,
                                item.note()))
                        .toList(),
                new SimulatedPlanSnapshotResponse(
                        generatedPlan.snapshot().planSnapshotId(),
                        generatedPlan.snapshot().snapshotId(),
                        generatedPlan.snapshot().reportId(),
                        generatedPlan.snapshot().inputSourceType(),
                        generatedPlan.snapshot().engineType(),
                        generatedPlan.snapshot().sourceReportStatus(),
                        generatedPlan.snapshot().strategyParameters(),
                        generatedPlan.snapshot().selectionCount(),
                        STATUS_PENDING_RESULT,
                        generatedPlan.snapshot().capturedAt()),
                generatedPlan.complianceNotice(),
                request.operatorNote(),
                generatedPlan.createdAt(),
                now);

        simulatedPlanRepository.savePlan(savedPlan);
        return savedPlan;
    }

    @Override
    public List<SimulatedPlanResponse> listSavedPlans() {
        return simulatedPlanRepository.listSavedPlans();
    }

    @Override
    public SimulatedPlanResponse getSavedPlan(String planId) {
        return simulatedPlanRepository.findPlan(planId)
                .filter(plan -> STATUS_PENDING_RESULT.equals(plan.planStatus()))
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Saved simulated plan not found."));
    }

    private void validateSimulationRequest(StrategySimulationRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Simulation request is required.");
        }
        if (!REQUIRED_SOURCE_TYPE.equals(request.inputSourceType())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only USER_SCREENSHOT_CONFIRMED reports can be simulated.");
        }
        if (!REQUIRED_REPORT_STATUS.equals(request.reportStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only GENERATED analysis reports can be simulated.");
        }
        if (request.reportId() == null || request.reportId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "reportId is required.");
        }
        if (request.snapshotId() == null || request.snapshotId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "snapshotId is required.");
        }
        if (request.simulatedSelections() == null || request.simulatedSelections().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one simulated selection is required.");
        }
    }

    private SimulatedPlanItemResponse buildGeneratedItem(
            SimulatedSelectionResponse selection,
            ProbabilityInsightResponse probabilityInsight) {
        return new SimulatedPlanItemResponse(
                "sim-item-%06d".formatted(itemSequence.getAndIncrement()),
                selection.matchId(),
                probabilityInsight == null ? null : probabilityInsight.matchDate(),
                probabilityInsight == null ? null : probabilityInsight.league(),
                probabilityInsight == null ? null : probabilityInsight.homeTeam(),
                probabilityInsight == null ? null : probabilityInsight.awayTeam(),
                probabilityInsight == null ? null : probabilityInsight.kickoffTime(),
                selection.playType(),
                selection.selection(),
                selection.odds(),
                selection.stakeAmount(),
                STATUS_GENERATED,
                selection.note());
    }

    private Map<String, ProbabilityInsightResponse> buildProbabilityMap(StrategySimulationRequest request) {
        if (request.probabilityAnalysis() == null) {
            return Map.of();
        }
        return request.probabilityAnalysis().stream()
                .filter(item -> item.matchId() != null && !item.matchId().isBlank())
                .collect(Collectors.toMap(
                        ProbabilityInsightResponse::matchId,
                        Function.identity(),
                        (first, ignored) -> first));
    }

    private String resolveEngineType(String engineType) {
        if (engineType == null || engineType.isBlank()) {
            return DEFAULT_ENGINE_TYPE;
        }
        return engineType;
    }

    private String now() {
        return OffsetDateTime.now(DEFAULT_ZONE).toString();
    }
}
