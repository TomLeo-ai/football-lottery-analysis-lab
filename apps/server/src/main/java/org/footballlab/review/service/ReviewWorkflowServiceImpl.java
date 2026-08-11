package org.footballlab.review.service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.service.SimulatedPlanService;
import org.footballlab.resultprovider.domain.PublicResultProviderStatusResponse;
import org.footballlab.resultprovider.domain.PublicResultSnapshotResponse;
import org.footballlab.resultprovider.service.PublicResultProviderService;
import org.footballlab.review.domain.ItemSettlementResponse;
import org.footballlab.review.domain.PendingReviewPlanResponse;
import org.footballlab.review.domain.ReviewInsightContext;
import org.footballlab.review.domain.ResultMatchCandidateResponse;
import org.footballlab.review.domain.ResultMatchResponse;
import org.footballlab.review.domain.ResultSourceResponse;
import org.footballlab.review.domain.ReviewRecordResponse;
import org.footballlab.review.domain.ReviewSettleRequest;
import org.footballlab.review.domain.StrategyRevisionRuleResponse;
import org.footballlab.review.repository.ReviewRecordRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ReviewWorkflowServiceImpl implements ReviewWorkflowService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final BigDecimal MIN_MATCH_CONFIDENCE = BigDecimal.valueOf(0.75);
    private static final String STATUS_PENDING_RESULT = "PENDING_RESULT";
    private static final String MATCHED = "MATCHED";
    private static final String RULE_REVIEW_ONLY = "RULE_REVIEW_ONLY";
    private static final String NEEDS_REVIEW = "NEEDS_REVIEW";
    private static final String HIT = "HIT";
    private static final String MISS = "MISS";
    private static final String PARTIAL_HIT = "PARTIAL_HIT";
    private static final String VOID = "VOID";
    private static final String PENDING = "PENDING";
    private static final String RESULT_STATUS_FINISHED = "FINISHED";
    private static final String PLAY_TYPE_WIN_DRAW_LOSS = "WIN_DRAW_LOSS";
    private static final String HOME_WIN = "HOME_WIN";
    private static final String AWAY_WIN = "AWAY_WIN";
    private static final String DRAW = "DRAW";
    private static final List<String> SUPPORTED_SETTLEMENT_STATUSES = List.of(
            HIT,
            MISS,
            PARTIAL_HIT,
            VOID,
            PENDING,
            NEEDS_REVIEW);
    private static final List<String> SUPPORTED_FAILURE_REASONS = List.of(
            "DIRECTION_ERROR",
            "PLAY_TYPE_ERROR",
            "PARLAY_STRUCTURE_ERROR",
            "ODDS_VALUE_ERROR",
            "INFO_RISK",
            "RANDOM_EVENT",
            "DATA_ERROR",
            "OCR_ERROR",
            "USER_CONFIRMATION_ERROR",
            "SOURCE_SCREENSHOT_INCOMPLETE",
            "RESULT_MATCHING_ERROR",
            "RESULT_SOURCE_CONFLICT",
            "RESULT_NOT_AVAILABLE",
            "MATCH_POSTPONED_OR_CANCELLED");

    private final SimulatedPlanService simulatedPlanService;
    private final PublicResultProviderService publicResultProviderService;
    private final ReviewRecordRepository reviewRecordRepository;
    private final Map<String, ReviewInsightEngine> reviewInsightEngines;
    private final AtomicLong candidateSequence = new AtomicLong(1);

    public ReviewWorkflowServiceImpl(
            SimulatedPlanService simulatedPlanService,
            PublicResultProviderService publicResultProviderService,
            ReviewRecordRepository reviewRecordRepository,
            List<ReviewInsightEngine> reviewInsightEngines) {
        this.simulatedPlanService = simulatedPlanService;
        this.publicResultProviderService = publicResultProviderService;
        this.reviewRecordRepository = reviewRecordRepository;
        this.reviewInsightEngines = reviewInsightEngines.stream()
                .collect(Collectors.toMap(
                        ReviewInsightEngine::reviewEngineMode,
                        Function.identity()));
    }

    @Override
    public List<PendingReviewPlanResponse> listPendingReviews() {
        return simulatedPlanService.listSavedPlans().stream()
                .filter(plan -> STATUS_PENDING_RESULT.equals(plan.planStatus()))
                .filter(plan -> !reviewRecordRepository.existsByPlanId(plan.planId()))
                .map(plan -> new PendingReviewPlanResponse(
                        plan.planId(),
                        plan.planStatus(),
                        plan.reportId(),
                        plan.items().size(),
                        plan.updatedAt()))
                .toList();
    }

    @Override
    public ResultMatchResponse matchResult(String planId) {
        SimulatedPlanResponse plan = simulatedPlanService.getSavedPlan(planId);
        PublicResultProviderStatusResponse providerStatus = publicResultProviderService.status();
        List<PublicResultSnapshotResponse> snapshots = providerStatus.snapshots() == null
                ? List.of()
                : providerStatus.snapshots();

        if (snapshots.isEmpty()) {
            ResultMatchResponse response = new ResultMatchResponse(
                    plan.planId(),
                    NEEDS_REVIEW,
                    BigDecimal.ZERO,
                    List.of(),
                    List.of("RESULT_NOT_AVAILABLE"));
            return response;
        }

        List<ResultMatchCandidateResponse> candidates = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        for (SimulatedPlanItemResponse item : plan.items()) {
            List<PublicResultSnapshotResponse> matchedSnapshots = snapshots.stream()
                    .filter(snapshot -> matchesItem(item, snapshot))
                    .toList();

            if (matchedSnapshots.isEmpty()) {
                warnings.add("RESULT_MATCHING_ERROR");
                continue;
            }
            if (matchedSnapshots.size() > 1) {
                warnings.add("RESULT_SOURCE_CONFLICT");
                continue;
            }

            PublicResultSnapshotResponse snapshot = matchedSnapshots.get(0);
            candidates.add(new ResultMatchCandidateResponse(
                    "candidate-%06d".formatted(candidateSequence.getAndIncrement()),
                    item.planItemId(),
                    snapshot.resultSnapshotId(),
                    snapshot.matchId(),
                    confidenceEnough(snapshot.confidence()) ? MATCHED : NEEDS_REVIEW,
                    snapshot.confidence(),
                    snapshot.sourceName(),
                    snapshot.sourceUrl(),
                    snapshot.sourceLicense(),
                    snapshot.fetchedAt()));
            if (!confidenceEnough(snapshot.confidence())) {
                warnings.add("RESULT_MATCHING_ERROR");
            }
        }

        BigDecimal matchConfidence = candidates.stream()
                .map(ResultMatchCandidateResponse::confidence)
                .filter(Objects::nonNull)
                .min(BigDecimal::compareTo)
                .orElse(BigDecimal.ZERO);
        boolean allItemsMatched = candidates.size() == plan.items().size();
        boolean allCandidatesTrusted = candidates.stream()
                .allMatch(candidate -> MATCHED.equals(candidate.matchStatus()));
        String matchStatus = allItemsMatched && allCandidatesTrusted ? MATCHED : NEEDS_REVIEW;
        return new ResultMatchResponse(
                plan.planId(),
                matchStatus,
                matchConfidence,
                candidates,
                distinct(warnings));
    }

    @Override
    public ReviewRecordResponse settle(String planId, ReviewSettleRequest request) {
        SimulatedPlanResponse plan = simulatedPlanService.getSavedPlan(planId);
        ResultMatchResponse matchResult = matchResult(plan.planId());
        PublicResultProviderStatusResponse providerStatus = publicResultProviderService.status();
        Map<String, PublicResultSnapshotResponse> snapshotById = providerStatus.snapshots() == null
                ? Map.of()
                : providerStatus.snapshots().stream()
                        .collect(Collectors.toMap(
                                PublicResultSnapshotResponse::resultSnapshotId,
                                Function.identity(),
                                (first, ignored) -> first));
        Map<String, ResultMatchCandidateResponse> candidateByItemId = matchResult.candidates().stream()
                .collect(Collectors.toMap(
                        ResultMatchCandidateResponse::planItemId,
                        Function.identity(),
                        (first, ignored) -> first));

        List<ItemSettlementResponse> itemSettlements = new ArrayList<>();
        List<String> failureReasons = new ArrayList<>(matchResult.reviewWarnings());
        if (!MATCHED.equals(matchResult.matchStatus()) && failureReasons.isEmpty()) {
            failureReasons.add("RESULT_MATCHING_ERROR");
        }

        if (MATCHED.equals(matchResult.matchStatus())) {
            for (SimulatedPlanItemResponse item : plan.items()) {
                ResultMatchCandidateResponse candidate = candidateByItemId.get(item.planItemId());
                PublicResultSnapshotResponse snapshot = candidate == null ? null : snapshotById.get(candidate.resultSnapshotId());
                ItemSettlementResponse settlement = settleItem(item, snapshot);
                itemSettlements.add(settlement);
                if (settlement.failureReason() != null && !settlement.failureReason().isBlank()) {
                    failureReasons.add(settlement.failureReason());
                }
            }
        }

        ResultSourceResponse resultSource = buildResultSource(matchResult.candidates());
        ReviewRecordResponse ruleReviewRecord = new ReviewRecordResponse(
                plan.planId(),
                resolveReviewStatus(itemSettlements, matchResult.matchStatus()),
                matchResult.matchStatus(),
                matchResult.matchConfidence(),
                itemSettlements,
                distinct(failureReasons),
                buildRevisionRules(failureReasons),
                resultSource,
                SUPPORTED_SETTLEMENT_STATUSES,
                SUPPORTED_FAILURE_REASONS,
                now(),
                plan.strategyParameters(),
                ReviewRecordResponse.RULE_REVIEW_ONLY,
                null,
                null,
                null,
                null,
                null,
                null);
        ReviewRecordResponse reviewRecord = attachReviewInsightIfRequested(plan, ruleReviewRecord, request);
        reviewRecordRepository.save(reviewRecord);
        return reviewRecord;
    }

    @Override
    public ReviewRecordResponse getReview(String planId) {
        return reviewRecordRepository.findByPlanId(planId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Review record not found."));
    }

    private ItemSettlementResponse settleItem(SimulatedPlanItemResponse item, PublicResultSnapshotResponse snapshot) {
        if (snapshot == null) {
            return new ItemSettlementResponse(
                    item.planItemId(),
                    item.matchId(),
                    item.selection(),
                    null,
                    NEEDS_REVIEW,
                    "RESULT_NOT_AVAILABLE");
        }

        if (!PLAY_TYPE_WIN_DRAW_LOSS.equals(item.playType())) {
            return new ItemSettlementResponse(
                    item.planItemId(),
                    item.matchId(),
                    item.selection(),
                    null,
                    NEEDS_REVIEW,
                    "PLAY_TYPE_ERROR");
        }

        if (!RESULT_STATUS_FINISHED.equals(snapshot.resultStatus())) {
            return new ItemSettlementResponse(
                    item.planItemId(),
                    item.matchId(),
                    item.selection(),
                    snapshot.resultStatus(),
                    VOID,
                    "MATCH_POSTPONED_OR_CANCELLED");
        }

        String actualOutcome = resolveWinDrawLossOutcome(snapshot);
        boolean isHit = actualOutcome.equals(item.selection());
        return new ItemSettlementResponse(
                item.planItemId(),
                item.matchId(),
                item.selection(),
                actualOutcome,
                isHit ? HIT : MISS,
                isHit ? null : "DIRECTION_ERROR");
    }

    private ReviewRecordResponse attachReviewInsightIfRequested(
            SimulatedPlanResponse plan,
            ReviewRecordResponse ruleReviewRecord,
            ReviewSettleRequest request) {
        String reviewEngineMode = resolveReviewEngineMode(request);
        if (RULE_REVIEW_ONLY.equals(reviewEngineMode)) {
            return ruleReviewRecord;
        }

        ReviewInsightEngine reviewInsightEngine = reviewInsightEngines.get(reviewEngineMode);
        if (reviewInsightEngine == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported reviewEngineMode: " + reviewEngineMode);
        }

        return ruleReviewRecord.withReviewInsight(reviewInsightEngine.generate(new ReviewInsightContext(
                plan,
                ruleReviewRecord,
                request)));
    }

    private String resolveReviewEngineMode(ReviewSettleRequest request) {
        if (request == null || request.reviewEngineMode() == null || request.reviewEngineMode().isBlank()) {
            return RULE_REVIEW_ONLY;
        }
        return request.reviewEngineMode();
    }

    private String resolveReviewStatus(List<ItemSettlementResponse> itemSettlements, String matchStatus) {
        if (!MATCHED.equals(matchStatus)) {
            return NEEDS_REVIEW;
        }
        if (itemSettlements.isEmpty()) {
            return NEEDS_REVIEW;
        }
        if (itemSettlements.stream().anyMatch(item -> NEEDS_REVIEW.equals(item.settlementStatus()))) {
            return NEEDS_REVIEW;
        }
        if (itemSettlements.stream().anyMatch(item -> PENDING.equals(item.settlementStatus()))) {
            return PENDING;
        }
        if (itemSettlements.stream().allMatch(item -> VOID.equals(item.settlementStatus()))) {
            return VOID;
        }
        long hitCount = itemSettlements.stream().filter(item -> HIT.equals(item.settlementStatus())).count();
        long missCount = itemSettlements.stream().filter(item -> MISS.equals(item.settlementStatus())).count();
        if (hitCount == itemSettlements.size()) {
            return HIT;
        }
        if (missCount == itemSettlements.size()) {
            return MISS;
        }
        return PARTIAL_HIT;
    }

    private List<StrategyRevisionRuleResponse> buildRevisionRules(List<String> failureReasons) {
        return distinct(failureReasons).stream()
                .map(this::toRevisionRule)
                .filter(Objects::nonNull)
                .toList();
    }

    private StrategyRevisionRuleResponse toRevisionRule(String failureReason) {
        return switch (failureReason) {
            case "DIRECTION_ERROR" -> new StrategyRevisionRuleResponse(
                    "REVIEW_DIRECTION_WEIGHT",
                    "DIRECTION_ERROR",
                    "复盘方向判断权重，下一版策略降低单一方向依赖。");
            case "PLAY_TYPE_ERROR" -> new StrategyRevisionRuleResponse(
                    "REVIEW_PLAY_TYPE_FILTER",
                    "PLAY_TYPE_ERROR",
                    "复盘玩法匹配规则，下一版策略优先校验玩法类型。");
            case "RESULT_MATCHING_ERROR" -> new StrategyRevisionRuleResponse(
                    "REVIEW_RESULT_MATCHING",
                    "RESULT_MATCHING_ERROR",
                    "复盘赛果匹配规则，下一版策略提高比赛元数据完整性。");
            default -> null;
        };
    }

    private ResultSourceResponse buildResultSource(List<ResultMatchCandidateResponse> candidates) {
        if (candidates.isEmpty()) {
            return null;
        }
        ResultMatchCandidateResponse candidate = candidates.get(0);
        return new ResultSourceResponse(
                candidate.sourceName(),
                candidate.sourceUrl(),
                candidate.sourceLicense(),
                candidate.fetchedAt(),
                candidate.confidence());
    }

    private boolean matchesItem(SimulatedPlanItemResponse item, PublicResultSnapshotResponse snapshot) {
        return Objects.equals(item.matchId(), snapshot.matchId())
                && equalsWhenAvailable(item.matchDate(), snapshot.matchDate())
                && equalsWhenAvailable(item.league(), snapshot.league())
                && equalsWhenAvailable(item.homeTeam(), snapshot.homeTeam())
                && equalsWhenAvailable(item.awayTeam(), snapshot.awayTeam())
                && equalsWhenAvailable(item.kickoffTime(), snapshot.kickoffTime());
    }

    private boolean equalsWhenAvailable(String planValue, String resultValue) {
        if (planValue == null || planValue.isBlank()) {
            return true;
        }
        return Objects.equals(planValue, resultValue);
    }

    private boolean confidenceEnough(BigDecimal confidence) {
        return confidence != null && confidence.compareTo(MIN_MATCH_CONFIDENCE) >= 0;
    }

    private String resolveWinDrawLossOutcome(PublicResultSnapshotResponse snapshot) {
        if (snapshot.homeScore() > snapshot.awayScore()) {
            return HOME_WIN;
        }
        if (snapshot.homeScore() < snapshot.awayScore()) {
            return AWAY_WIN;
        }
        return DRAW;
    }

    private List<String> distinct(List<String> values) {
        return values.stream()
                .filter(value -> value != null && !value.isBlank())
                .collect(Collectors.collectingAndThen(
                        Collectors.toCollection(LinkedHashSet::new),
                        List::copyOf));
    }

    private String now() {
        return OffsetDateTime.now(DEFAULT_ZONE).toString();
    }
}
