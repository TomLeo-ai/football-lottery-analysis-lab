package org.footballlab.strategy.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StrategyParameterValidator {

    private static final Set<String> RISK_PREFERENCES = Set.of("CONSERVATIVE", "BALANCED", "AGGRESSIVE");
    private static final Set<String> EXACT_SCORE_POLICIES = Set.of(
            "DISABLED",
            "ENTERTAINMENT_ONLY",
            "ALLOWED_WITH_REASON");
    private static final Set<String> UPSET_COVERAGE_LEVELS = Set.of("NONE", "LIGHT", "BALANCED", "STRONG");

    private final StrategyParameterDefaultsService defaultsService;

    public StrategyParameterValidator(StrategyParameterDefaultsService defaultsService) {
        this.defaultsService = defaultsService;
    }

    public StrategyParameterRequest resolve(StrategyParameterRequest request) {
        StrategyParameterRequest defaults = defaultsService.getDefaults();
        StrategyParameterRequest resolved = new StrategyParameterRequest(
                normalizeAmount(valueOrDefault(request == null ? null : request.budgetAmount(), defaults.budgetAmount())),
                valueOrDefault(request == null ? null : request.currency(), defaults.currency()),
                valueOrDefault(request == null ? null : request.targetTicketCount(), defaults.targetTicketCount()),
                valueOrDefault(request == null ? null : request.minTicketCount(), defaults.minTicketCount()),
                valueOrDefault(request == null ? null : request.maxTicketCount(), defaults.maxTicketCount()),
                valueOrDefault(request == null ? null : request.riskPreference(), defaults.riskPreference()),
                valueOrDefault(request == null ? null : request.mainTicketRatio(), defaults.mainTicketRatio()),
                valueOrDefault(request == null ? null : request.defensiveTicketRatio(), defaults.defensiveTicketRatio()),
                valueOrDefault(request == null ? null : request.entertainmentTicketRatio(), defaults.entertainmentTicketRatio()),
                valueOrDefault(request == null ? null : request.enableEntertainmentTicket(), defaults.enableEntertainmentTicket()),
                normalizeAmount(valueOrDefault(
                        request == null ? null : request.entertainmentTicketMaxCost(),
                        defaults.entertainmentTicketMaxCost())),
                valueOrDefault(request == null ? null : request.maxParlayLegs(), defaults.maxParlayLegs()),
                valueOrDefault(request == null ? null : request.preferredPlayTypes(), defaults.preferredPlayTypes()),
                valueOrDefault(request == null ? null : request.excludedPlayTypes(), defaults.excludedPlayTypes()),
                valueOrDefault(request == null ? null : request.exactScorePolicy(), defaults.exactScorePolicy()),
                normalizeOptionalAmount(request == null ? null : request.minPayoutRequirement()),
                valueOrDefault(request == null ? null : request.allowLowReturnTicket(), defaults.allowLowReturnTicket()),
                valueOrDefault(request == null ? null : request.upsetCoverageLevel(), defaults.upsetCoverageLevel()));

        validate(resolved);
        return resolved;
    }

    private void validate(StrategyParameterRequest parameters) {
        if (parameters.budgetAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw badRequest("budgetAmount must be greater than zero.");
        }
        if (parameters.targetTicketCount() <= 0 || parameters.minTicketCount() <= 0 || parameters.maxTicketCount() <= 0) {
            throw badRequest("ticket count values must be greater than zero.");
        }
        if (parameters.minTicketCount() > parameters.maxTicketCount()) {
            throw badRequest("minTicketCount must not be greater than maxTicketCount.");
        }
        if (parameters.targetTicketCount() < parameters.minTicketCount()
                || parameters.targetTicketCount() > parameters.maxTicketCount()) {
            throw badRequest("targetTicketCount must be within minTicketCount and maxTicketCount.");
        }
        if (!RISK_PREFERENCES.contains(parameters.riskPreference())) {
            throw badRequest("Unsupported riskPreference: " + parameters.riskPreference());
        }
        if (!EXACT_SCORE_POLICIES.contains(parameters.exactScorePolicy())) {
            throw badRequest("Unsupported exactScorePolicy: " + parameters.exactScorePolicy());
        }
        if (!UPSET_COVERAGE_LEVELS.contains(parameters.upsetCoverageLevel())) {
            throw badRequest("Unsupported upsetCoverageLevel: " + parameters.upsetCoverageLevel());
        }
        if (parameters.maxParlayLegs() <= 0) {
            throw badRequest("maxParlayLegs must be greater than zero.");
        }
        if (parameters.entertainmentTicketMaxCost().compareTo(BigDecimal.ZERO) < 0) {
            throw badRequest("entertainmentTicketMaxCost must not be negative.");
        }
        if (parameters.enableEntertainmentTicket()
                && parameters.entertainmentTicketMaxCost().compareTo(parameters.budgetAmount()) > 0) {
            throw badRequest("entertainmentTicketMaxCost must not exceed budgetAmount.");
        }
        validateRatios(parameters);
        validatePlayTypeLists(parameters);
    }

    private void validateRatios(StrategyParameterRequest parameters) {
        BigDecimal ratioSum = parameters.mainTicketRatio()
                .add(parameters.defensiveTicketRatio())
                .add(parameters.entertainmentTicketRatio())
                .setScale(2, RoundingMode.HALF_UP);
        if (ratioSum.compareTo(BigDecimal.ONE.setScale(2, RoundingMode.HALF_UP)) != 0) {
            throw badRequest("budget ratios must add up to 1.00.");
        }
    }

    private void validatePlayTypeLists(StrategyParameterRequest parameters) {
        Set<String> preferred = new HashSet<>(parameters.preferredPlayTypes());
        Set<String> excluded = new HashSet<>(parameters.excludedPlayTypes());
        preferred.retainAll(excluded);
        if (!preferred.isEmpty()) {
            throw badRequest("preferredPlayTypes must not overlap excludedPlayTypes.");
        }
    }

    private BigDecimal normalizeAmount(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal normalizeOptionalAmount(BigDecimal value) {
        return value == null ? null : normalizeAmount(value);
    }

    private ResponseStatusException badRequest(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }

    private <T> T valueOrDefault(T value, T defaultValue) {
        return value == null ? defaultValue : value;
    }

    private String valueOrDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private List<String> valueOrDefault(List<String> value, List<String> defaultValue) {
        return value == null ? defaultValue : value;
    }
}
