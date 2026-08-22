package org.footballlab.strategy.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import org.footballlab.analysis.domain.AnalysisOptionsRequest;
import org.footballlab.strategy.domain.ResolvedStrategyParameters;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AnalysisOptionsResolver {

    private static final String WDL_PLAY_TYPE = "WIN_DRAW_LOSS";
    private static final String EXACT_SCORE_DISABLED = "DISABLED";
    private static final String DEFAULTS_VERSION = StrategyParameterDefaultsService.V2_DEFAULTS_VERSION;
    private static final Set<String> RISK_PREFERENCES = Set.of("LOW", "BALANCED", "AGGRESSIVE");
    private static final Set<String> UPSET_COVERAGE_LEVELS = Set.of("NONE", "LIGHT", "BALANCED", "STRONG");

    private static final BigDecimal DEFAULT_MAIN_RATIO = new BigDecimal("0.60");
    private static final BigDecimal DEFAULT_DEFENSIVE_RATIO = new BigDecimal("0.30");
    private static final BigDecimal DEFAULT_ENTERTAINMENT_RATIO = new BigDecimal("0.10");
    private static final BigDecimal DEFAULT_ENTERTAINMENT_MAX_COST = new BigDecimal("2.00");
    private static final BigDecimal ONE = new BigDecimal("1.00");
    private static final BigDecimal ZERO = new BigDecimal("0.00");

    public ResolvedStrategyParameters resolve(
            AnalysisOptionsRequest request,
            BigDecimal budgetAmount,
            String currency,
            String riskPreference,
            int matchCount) {
        validateAuthority(budgetAmount, currency, riskPreference, matchCount);
        int defaultTicketCount = Math.min(4, matchCount);
        int targetTicketCount = valueOrDefault(request == null ? null : request.targetTicketCount(), defaultTicketCount);
        int minTicketCount = valueOrDefault(request == null ? null : request.minTicketCount(), targetTicketCount);
        int maxTicketCount = valueOrDefault(request == null ? null : request.maxTicketCount(), targetTicketCount);
        BigDecimal mainRatio = valueOrDefault(request == null ? null : request.mainTicketRatio(), DEFAULT_MAIN_RATIO);
        BigDecimal defensiveRatio = valueOrDefault(request == null ? null : request.defensiveTicketRatio(), DEFAULT_DEFENSIVE_RATIO);
        BigDecimal entertainmentRatio = valueOrDefault(request == null ? null : request.entertainmentTicketRatio(), DEFAULT_ENTERTAINMENT_RATIO);
        boolean enableEntertainmentTicket = valueOrDefault(
                request == null ? null : request.enableEntertainmentTicket(),
                true);
        BigDecimal entertainmentTicketMaxCost = valueOrDefault(
                request == null ? null : request.entertainmentTicketMaxCost(),
                DEFAULT_ENTERTAINMENT_MAX_COST.min(budgetAmount));
        int maxParlayLegs = valueOrDefault(request == null ? null : request.maxParlayLegs(), Math.min(10, matchCount));
        BigDecimal minPayoutRequirement = request == null ? null : request.minPayoutRequirement();
        boolean allowLowReturnTicket = valueOrDefault(
                request == null ? null : request.allowLowReturnTicket(),
                false);
        String upsetCoverageLevel = valueOrDefault(
                request == null ? null : request.upsetCoverageLevel(),
                "BALANCED");

        validateTicketCounts(targetTicketCount, minTicketCount, maxTicketCount);
        validateRatios(mainRatio, defensiveRatio, entertainmentRatio);
        validateMoney(entertainmentTicketMaxCost, budgetAmount, "entertainmentTicketMaxCost");
        if (minPayoutRequirement != null) {
            validateMoney(minPayoutRequirement, null, "minPayoutRequirement");
        }
        if (maxParlayLegs <= 0 || maxParlayLegs > Math.min(10, matchCount)) {
            throw badRequest("maxParlayLegs must be between 1 and min(10, matchCount).");
        }
        if (!UPSET_COVERAGE_LEVELS.contains(upsetCoverageLevel)) {
            throw badRequest("Unsupported upsetCoverageLevel: " + upsetCoverageLevel);
        }

        return new ResolvedStrategyParameters(
                budgetAmount,
                currency,
                riskPreference,
                targetTicketCount,
                minTicketCount,
                maxTicketCount,
                mainRatio,
                defensiveRatio,
                entertainmentRatio,
                enableEntertainmentTicket,
                entertainmentTicketMaxCost,
                maxParlayLegs,
                minPayoutRequirement,
                allowLowReturnTicket,
                upsetCoverageLevel,
                List.of(WDL_PLAY_TYPE),
                List.of(),
                EXACT_SCORE_DISABLED,
                DEFAULTS_VERSION);
    }

    private void validateAuthority(
            BigDecimal budgetAmount,
            String currency,
            String riskPreference,
            int matchCount) {
        if (budgetAmount == null || budgetAmount.compareTo(BigDecimal.ZERO) <= 0 || hasScaleGreaterThan(budgetAmount, 2)) {
            throw badRequest("snapshot budgetAmount must be a positive amount with at most two decimals.");
        }
        if (!"CNY".equals(currency)) {
            throw badRequest("snapshot currency must be CNY.");
        }
        if (!RISK_PREFERENCES.contains(riskPreference)) {
            throw badRequest("Unsupported snapshot riskPreference: " + riskPreference);
        }
        if (matchCount <= 0) {
            throw badRequest("matchCount must be greater than zero.");
        }
    }

    private void validateTicketCounts(int targetTicketCount, int minTicketCount, int maxTicketCount) {
        if (targetTicketCount <= 0 || minTicketCount <= 0 || maxTicketCount <= 0) {
            throw badRequest("ticket count values must be greater than zero.");
        }
        if (minTicketCount > maxTicketCount) {
            throw badRequest("minTicketCount must not be greater than maxTicketCount.");
        }
        if (targetTicketCount < minTicketCount || targetTicketCount > maxTicketCount) {
            throw badRequest("targetTicketCount must be within minTicketCount and maxTicketCount.");
        }
    }

    private void validateRatios(
            BigDecimal mainRatio,
            BigDecimal defensiveRatio,
            BigDecimal entertainmentRatio) {
        validateRatio(mainRatio, "mainTicketRatio");
        validateRatio(defensiveRatio, "defensiveTicketRatio");
        validateRatio(entertainmentRatio, "entertainmentTicketRatio");
        if (mainRatio.add(defensiveRatio).add(entertainmentRatio).compareTo(ONE) != 0) {
            throw badRequest("budget ratios must add up exactly to 1.00.");
        }
    }

    private void validateRatio(BigDecimal value, String fieldName) {
        if (value == null || value.compareTo(ZERO) < 0 || value.compareTo(ONE) > 0 || hasScaleGreaterThan(value, 2)) {
            throw badRequest(fieldName + " must be between 0.00 and 1.00 with at most two decimals.");
        }
    }

    private void validateMoney(BigDecimal value, BigDecimal maxValue, String fieldName) {
        if (value == null || value.compareTo(ZERO) < 0 || hasScaleGreaterThan(value, 2)) {
            throw badRequest(fieldName + " must be non-negative with at most two decimals.");
        }
        if (maxValue != null && value.compareTo(maxValue) > 0) {
            throw badRequest(fieldName + " must not exceed budgetAmount.");
        }
    }

    private boolean hasScaleGreaterThan(BigDecimal value, int maxScale) {
        return value.stripTrailingZeros().scale() > maxScale;
    }

    private int valueOrDefault(Integer value, int defaultValue) {
        return value == null ? defaultValue : value;
    }

    private boolean valueOrDefault(Boolean value, boolean defaultValue) {
        return value == null ? defaultValue : value;
    }

    private BigDecimal valueOrDefault(BigDecimal value, BigDecimal defaultValue) {
        return value == null ? defaultValue : value;
    }

    private String valueOrDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value.trim();
    }

    private ResponseStatusException badRequest(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }
}
