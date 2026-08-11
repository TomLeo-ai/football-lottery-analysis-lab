package org.footballlab.llm.service;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.AnalysisMarketRequest;
import org.footballlab.llm.domain.PredictionValidationResult;
import org.footballlab.llm.domain.ReviewInsightValidationResult;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LlmOutputValidator {

    private static final List<String> REQUIRED_PREDICTION_FIELDS = List.of(
            "parameterUsage",
            "scorePredictions",
            "upsetFocus",
            "stableMatches",
            "ticketGroups",
            "finalDecision",
            "ledgerSnapshot",
            "complianceNotice");
    private static final List<String> REQUIRED_REVIEW_INSIGHT_FIELDS = List.of(
            "settlementAuthorityNotice",
            "ticketReviewNarratives",
            "failureClassifications",
            "strategyRevisionSuggestions",
            "nextRoundParameterSuggestions",
            "doNotOverreactEvents",
            "complianceNotice");
    private static final Set<String> REVIEW_SETTLEMENT_MUTATION_FIELDS = Set.of(
            "reviewstatus",
            "settlementstatus",
            "matchstatus",
            "itemsettlements",
            "actualscore",
            "actualreturnamount",
            "actualpayoutamount",
            "homescore",
            "awayscore",
            "resultstatus");
    private static final String REQUIRED_COMPLIANCE_NOTICE =
            "非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议，不承诺命中率、收益或确定性结果。";

    private final ObjectMapper objectMapper;
    private final SafetyGuardService safetyGuardService;

    public LlmOutputValidator(ObjectMapper objectMapper, SafetyGuardService safetyGuardService) {
        this.objectMapper = objectMapper;
        this.safetyGuardService = safetyGuardService;
    }

    public PredictionValidationResult validatePredictionOutput(
            String rawJson,
            StrategyParameterRequest strategyParameters,
            List<AnalysisMarketRequest> confirmedMarkets) {
        safetyGuardService.assertSafe(rawJson);
        JsonNode output = parse(rawJson);
        validateRequiredFields(output, REQUIRED_PREDICTION_FIELDS);
        validateComplianceNotice(output.path("complianceNotice").asText(""));
        validateTicketGroups(output.path("ticketGroups"), strategyParameters, confirmedMarkets);
        return new PredictionValidationResult(output, "PASSED");
    }

    public ReviewInsightValidationResult validateReviewInsightOutput(String rawJson) {
        safetyGuardService.assertSafe(rawJson);
        JsonNode output = parse(rawJson);
        validateRequiredFields(output, REQUIRED_REVIEW_INSIGHT_FIELDS);
        validateComplianceNotice(output.path("complianceNotice").asText(""));
        validateReviewSettlementMutationFields(output);
        return new ReviewInsightValidationResult(output, "PASSED");
    }

    private JsonNode parse(String rawJson) {
        try {
            JsonNode output = objectMapper.readTree(normalizeJsonPayload(rawJson));
            if (output == null || !output.isObject()) {
                throw badRequest("INVALID_JSON_OBJECT");
            }
            return output;
        } catch (IOException exception) {
            throw badRequest("INVALID_JSON");
        }
    }

    private String normalizeJsonPayload(String rawJson) {
        if (rawJson == null) {
            return null;
        }
        String trimmed = rawJson.trim();
        if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) {
            return rawJson;
        }

        int firstLineEnd = trimmed.indexOf('\n');
        if (firstLineEnd < 0) {
            return rawJson;
        }
        String fenceHeader = trimmed.substring(0, firstLineEnd).trim().toLowerCase(Locale.ROOT);
        if (!"```json".equals(fenceHeader) && !"```".equals(fenceHeader)) {
            return rawJson;
        }
        return trimmed.substring(firstLineEnd + 1, trimmed.length() - 3).trim();
    }

    private void validateRequiredFields(JsonNode output, List<String> requiredFields) {
        for (String requiredField : requiredFields) {
            if (!output.has(requiredField)) {
                throw badRequest("MISSING_FIELD:" + requiredField);
            }
        }
    }

    private void validateComplianceNotice(String complianceNotice) {
        if (!REQUIRED_COMPLIANCE_NOTICE.equals(complianceNotice)) {
            throw badRequest("MISSING_COMPLIANCE_NOTICE");
        }
    }

    private void validateTicketGroups(
            JsonNode ticketGroups,
            StrategyParameterRequest strategyParameters,
            List<AnalysisMarketRequest> confirmedMarkets) {
        if (!ticketGroups.isArray()) {
            throw badRequest("INVALID_TICKET_GROUPS");
        }

        Set<String> confirmedMarketKeys = confirmedMarketKeys(confirmedMarkets);
        BigDecimal totalCost = BigDecimal.ZERO;
        for (JsonNode ticketGroup : ticketGroups) {
            totalCost = totalCost.add(ticketGroupCost(ticketGroup));
            validateLegCount(ticketGroup, strategyParameters.maxParlayLegs());
            validateSelections(
                    ticketGroup.path("selections"),
                    strategyParameters.excludedPlayTypes(),
                    confirmedMarketKeys);
        }

        if (totalCost.compareTo(strategyParameters.budgetAmount()) > 0) {
            throw badRequest("BUDGET_EXCEEDED");
        }
    }

    private BigDecimal ticketGroupCost(JsonNode ticketGroup) {
        JsonNode cost = ticketGroup.path("cost");
        if (!cost.isNumber()) {
            throw badRequest("INVALID_TICKET_COST");
        }
        return cost.decimalValue();
    }

    private void validateLegCount(JsonNode ticketGroup, Integer maxParlayLegs) {
        JsonNode legs = ticketGroup.path("legs");
        if (legs.isArray() && legs.size() > maxParlayLegs) {
            throw badRequest("MAX_PARLAY_LEGS_EXCEEDED");
        }
    }

    private void validateSelections(
            JsonNode selections,
            List<String> excludedPlayTypes,
            Set<String> confirmedMarketKeys) {
        if (!selections.isArray()) {
            throw badRequest("INVALID_SELECTIONS");
        }

        Iterator<JsonNode> iterator = selections.elements();
        while (iterator.hasNext()) {
            JsonNode selection = iterator.next();
            String matchId = selection.path("matchId").asText("");
            String playType = selection.path("playType").asText("");
            String selectedValue = selection.path("selection").asText("");
            if (excludedPlayTypes.contains(playType)) {
                throw badRequest("EXCLUDED_PLAY_TYPE");
            }
            if (!confirmedMarketKeys.contains(marketKey(matchId, playType, selectedValue))) {
                throw badRequest("INVALID_SELECTION_MARKET");
            }
        }
    }

    private Set<String> confirmedMarketKeys(List<AnalysisMarketRequest> confirmedMarkets) {
        Set<String> keys = new HashSet<>();
        if (confirmedMarkets == null) {
            return keys;
        }
        for (AnalysisMarketRequest market : confirmedMarkets) {
            keys.add(marketKey(market.matchId(), market.playType(), market.selection()));
        }
        return keys;
    }

    private String marketKey(String matchId, String playType, String selection) {
        return "%s|%s|%s".formatted(matchId, playType, selection);
    }

    private void validateReviewSettlementMutationFields(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return;
        }
        if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                String normalizedFieldName = field.getKey().toLowerCase(Locale.ROOT);
                if (REVIEW_SETTLEMENT_MUTATION_FIELDS.contains(normalizedFieldName)) {
                    throw badRequest("REVIEW_SETTLEMENT_MUTATION_FIELD:" + field.getKey());
                }
                validateReviewSettlementMutationFields(field.getValue());
            }
            return;
        }
        if (node.isArray()) {
            Iterator<JsonNode> iterator = node.elements();
            while (iterator.hasNext()) {
                validateReviewSettlementMutationFields(iterator.next());
            }
        }
    }

    private ResponseStatusException badRequest(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }
}
