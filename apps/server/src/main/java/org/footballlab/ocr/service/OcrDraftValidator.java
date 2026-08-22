package org.footballlab.ocr.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.footballlab.common.error.ApiException;
import org.footballlab.common.error.ApiFieldError;
import org.footballlab.ocr.domain.DraftMarketRequest;
import org.footballlab.ocr.domain.DraftMatchRequest;
import org.footballlab.ocr.domain.OcrReviewDraftUpdateRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class OcrDraftValidator {

    private static final int MAX_MATCHES = 64;
    private static final BigDecimal MIN_ODDS = new BigDecimal("1.01");
    private static final BigDecimal MAX_ODDS = new BigDecimal("1000");
    private static final BigDecimal MIN_BUDGET = new BigDecimal("0.01");
    private static final BigDecimal MAX_BUDGET = new BigDecimal("1000000");

    public void validate(OcrReviewDraftUpdateRequest request) {
        if (request == null) {
            throw validationFailed(List.of(new ApiFieldError("body", "Request body is required.")));
        }
        List<ApiFieldError> errors = new ArrayList<>();
        if (request.getExpectedRevision() < 0) {
            errors.add(new ApiFieldError("expectedRevision", "expectedRevision must be zero or greater."));
        }
        validateRiskAndBudget(request, errors);
        validateMatches(request.getMatches(), errors);
        validateMarkets(request.getMarkets(), request.getMatches(), errors);
        if (!errors.isEmpty()) {
            throw validationFailed(errors);
        }
    }

    private void validateRiskAndBudget(OcrReviewDraftUpdateRequest request, List<ApiFieldError> errors) {
        if (!"LOW".equals(request.getRiskPreference())
                && !"BALANCED".equals(request.getRiskPreference())
                && !"AGGRESSIVE".equals(request.getRiskPreference())) {
            errors.add(new ApiFieldError("riskPreference", "riskPreference must be LOW, BALANCED, or AGGRESSIVE."));
        }
        if (!"CNY".equals(request.getCurrency())) {
            errors.add(new ApiFieldError("currency", "currency must be CNY."));
        }
        BigDecimal budget = request.getBudgetAmount();
        if (budget == null || budget.compareTo(MIN_BUDGET) < 0 || budget.compareTo(MAX_BUDGET) > 0 || scaleOf(budget) > 2) {
            errors.add(new ApiFieldError("budgetAmount", "budgetAmount must be 0.01-1000000 with at most two decimals."));
        }
    }

    private void validateMatches(List<DraftMatchRequest> matches, List<ApiFieldError> errors) {
        if (matches.size() > MAX_MATCHES) {
            errors.add(new ApiFieldError("matches", "matches must not exceed 64 items."));
        }
        Set<String> matchIds = new HashSet<>();
        for (int i = 0; i < matches.size(); i++) {
            DraftMatchRequest match = matches.get(i);
            String prefix = "matches[" + i + "]";
            if (isBlank(match.getMatchId()) || !matchIds.add(match.getMatchId())) {
                errors.add(new ApiFieldError(prefix + ".matchId", "matchId is required and must be unique."));
            }
            if (isBlank(match.getHomeTeam())) {
                errors.add(new ApiFieldError(prefix + ".homeTeam", "homeTeam is required."));
            }
            if (isBlank(match.getAwayTeam())) {
                errors.add(new ApiFieldError(prefix + ".awayTeam", "awayTeam is required."));
            }
        }
    }

    private void validateMarkets(
            List<DraftMarketRequest> markets,
            List<DraftMatchRequest> matches,
            List<ApiFieldError> errors
    ) {
        Set<String> matchIds = new HashSet<>();
        for (DraftMatchRequest match : matches) {
            matchIds.add(match.getMatchId());
        }
        Set<String> marketIds = new HashSet<>();
        Set<String> marketMatchIds = new HashSet<>();
        for (int i = 0; i < markets.size(); i++) {
            DraftMarketRequest market = markets.get(i);
            String prefix = "markets[" + i + "]";
            if (isBlank(market.getMarketId()) || !marketIds.add(market.getMarketId())) {
                errors.add(new ApiFieldError(prefix + ".marketId", "marketId is required and must be unique."));
            }
            if (isBlank(market.getMatchId()) || !matchIds.contains(market.getMatchId())) {
                errors.add(new ApiFieldError(prefix + ".matchId", "market matchId must reference a draft match."));
            } else if (!marketMatchIds.add(market.getMatchId())) {
                errors.add(new ApiFieldError(prefix + ".matchId", "only one market is allowed per match."));
            }
            if (!"WIN_DRAW_LOSS".equals(market.getPlayType())) {
                errors.add(new ApiFieldError(prefix + ".playType", "playType must be WIN_DRAW_LOSS."));
            }
            if (!"HOME_WIN".equals(market.getSelection())
                    && !"DRAW".equals(market.getSelection())
                    && !"AWAY_WIN".equals(market.getSelection())) {
                errors.add(new ApiFieldError(prefix + ".selection", "selection must be HOME_WIN, DRAW, or AWAY_WIN."));
            }
            BigDecimal odds = market.getOdds();
            if (odds == null || odds.compareTo(MIN_ODDS) < 0 || odds.compareTo(MAX_ODDS) > 0 || scaleOf(odds) > 4) {
                errors.add(new ApiFieldError(prefix + ".odds", "odds must be 1.01-1000 with at most four decimals."));
            }
        }
    }

    private int scaleOf(BigDecimal value) {
        return Math.max(value.stripTrailingZeros().scale(), 0);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private ApiException validationFailed(List<ApiFieldError> fieldErrors) {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                "Request validation failed.",
                fieldErrors,
                java.util.Map.of());
    }
}
