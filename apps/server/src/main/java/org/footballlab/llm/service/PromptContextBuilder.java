package org.footballlab.llm.service;

import java.util.LinkedHashMap;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.service.AuthoritativeAnalysisInput;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.review.domain.ReviewRecordResponse;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PromptContextBuilder {

    private final ObjectMapper objectMapper;

    public PromptContextBuilder(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String buildPredictionContext(
            AuthoritativeAnalysisInput input,
            StrategyParameterRequest strategyParameters) {
        Map<String, Object> inputBoundary = new LinkedHashMap<>();
        inputBoundary.put("authorityType", input.authorityType());
        inputBoundary.put("sourceType", input.sourceType());
        inputBoundary.put("snapshotStatus", input.snapshotStatus());
        inputBoundary.put("analysisAllowed", input.analysisAllowed());
        inputBoundary.put("rawScreenshotIncluded", false);

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("workflowId", input.workflowId());
        snapshot.put("snapshotId", input.snapshotId());
        snapshot.put("confirmedAt", input.confirmedAt());
        snapshot.put("matches", input.matches());
        snapshot.put("markets", input.markets());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("task", "football_probability_simulation_prediction");
        payload.put("inputBoundary", inputBoundary);
        payload.put("snapshot", snapshot);
        payload.put("strategyParameters", strategyParameters);
        try {
            return """
                    请基于以下 JSON 生成概率化模拟分析。只能使用 JSON 内的用户确认快照字段，不得补充原始截图、内部消息或未给出的事实。
                    %s
                    """.formatted(objectMapper.writeValueAsString(payload));
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Prompt context build failed", exception);
        }
    }

    public String buildReviewInsightContext(
            SimulatedPlanResponse plan,
            ReviewRecordResponse ruleReviewRecord) {
        Map<String, Object> inputBoundary = new LinkedHashMap<>();
        inputBoundary.put("settlementAuthority", "RULE_ENGINE");
        inputBoundary.put("ruleSettlementLocked", true);
        inputBoundary.put("llmCanModifySettlement", false);
        inputBoundary.put("rawScreenshotIncluded", false);

        Map<String, Object> planPayload = new LinkedHashMap<>();
        planPayload.put("planId", plan.planId());
        planPayload.put("reportId", plan.reportId());
        planPayload.put("snapshotId", plan.snapshotId());
        planPayload.put("strategyParameters", plan.strategyParameters());
        planPayload.put("items", plan.items());

        Map<String, Object> settlementPayload = new LinkedHashMap<>();
        settlementPayload.put("reviewStatus", ruleReviewRecord.reviewStatus());
        settlementPayload.put("matchStatus", ruleReviewRecord.matchStatus());
        settlementPayload.put("matchConfidence", ruleReviewRecord.matchConfidence());
        settlementPayload.put("itemSettlements", ruleReviewRecord.itemSettlements());
        settlementPayload.put("failureReasons", ruleReviewRecord.failureReasons());
        settlementPayload.put("strategyRevisionRules", ruleReviewRecord.strategyRevisionRules());
        settlementPayload.put("resultSource", ruleReviewRecord.resultSource());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("task", "football_rule_settlement_review_insight");
        payload.put("inputBoundary", inputBoundary);
        payload.put("plan", planPayload);
        payload.put("ruleSettlement", settlementPayload);

        try {
            return """
                    请基于以下 JSON 生成复盘洞察。规则引擎结算结果已经锁定，大模型只能解释、分类和给出手动参数建议，不得改写结算状态、比分或回收金额。
                    %s
                    """.formatted(objectMapper.writeValueAsString(payload));
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Prompt context build failed", exception);
        }
    }
}
