package org.footballlab.analysis.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import org.footballlab.analysis.domain.AnalysisMarketRequest;
import org.footballlab.analysis.domain.AnalysisMatchRequest;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.RiskWarningResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.springframework.stereotype.Component;

@Component
public class MockRuleAnalysisEngine implements AnalysisEngine {

    public static final String ENGINE_MODE = "MOCK_RULE_ENGINE";

    private static final String REPORT_STATUS = "GENERATED";
    private static final String COMPLIANCE_NOTICE = "非官方，仅模拟分析/复盘；仅供技术研究和流程验证，不构成确定性建议。";

    @Override
    public String engineMode() {
        return ENGINE_MODE;
    }

    @Override
    public AnalysisEngineResult generate(AnalysisEngineContext context) {
        AuthoritativeAnalysisInput input = context.input();
        StrategyParameterRequest strategyParameters = context.strategyParameters();
        List<ProbabilityInsightResponse> probabilityAnalysis = input.matches().stream()
                .map(match -> buildProbabilityInsight(match, findMarketForMatch(input, match.matchId())))
                .toList();
        List<RiskWarningResponse> riskWarnings = List.of(
                new RiskWarningResponse(
                        "INFO_RISK",
                        resolveRiskLevel(strategyParameters.riskPreference()),
                        "仅基于用户确认快照与虚构样例字段，缺少真实临场信息和多源交叉验证。"),
                new RiskWarningResponse(
                        "DATA_ERROR",
                        "LOW",
                        "当前阶段使用 Mock 规则引擎，分析结果只用于验证数据流。"));
        List<SimulatedSelectionResponse> simulatedSelections = input.markets().stream()
                .map(market -> new SimulatedSelectionResponse(
                        market.matchId(),
                        market.playType(),
                        market.selection(),
                        market.odds(),
                        calculateStake(strategyParameters.budgetAmount(), input.markets().size()),
                        "模拟选择，用于下一阶段生成模拟方案前的候选项。"))
                .toList();

        return new AnalysisEngineResult(new AnalysisReportResponse(
                context.reportId(),
                input.snapshotId(),
                input.sourceType(),
                ENGINE_MODE,
                REPORT_STATUS,
                strategyParameters,
                probabilityAnalysis,
                riskWarnings,
                simulatedSelections,
                COMPLIANCE_NOTICE,
                context.generatedAt(),
                null,
                null,
                null,
                "PASSED",
                null,
                null));
    }

    private ProbabilityInsightResponse buildProbabilityInsight(
            AnalysisMatchRequest match,
            AnalysisMarketRequest market) {
        String selection = market == null ? "NO_SELECTION" : market.selection();
        String probabilityBand = market == null ? "LOW" : resolveProbabilityBand(market.odds());
        String rationale = "%s 对阵 %s 的 %s 方向来自用户确认快照；规则引擎仅给出区间判断，并保留不确定性。"
                .formatted(match.homeTeam(), match.awayTeam(), selection);
        return new ProbabilityInsightResponse(
                match.matchId(),
                match.matchDate(),
                match.league(),
                match.kickoffTime(),
                match.homeTeam(),
                match.awayTeam(),
                selection,
                probabilityBand,
                rationale);
    }

    private AnalysisMarketRequest findMarketForMatch(AuthoritativeAnalysisInput input, String matchId) {
        return input.markets().stream()
                .filter(market -> matchId.equals(market.matchId()))
                .findFirst()
                .orElse(null);
    }

    private String resolveProbabilityBand(BigDecimal odds) {
        if (odds == null) {
            return "LOW";
        }
        if (odds.compareTo(BigDecimal.valueOf(1.8)) <= 0) {
            return "MEDIUM_HIGH";
        }
        if (odds.compareTo(BigDecimal.valueOf(2.6)) <= 0) {
            return "MEDIUM";
        }
        return "LOW";
    }

    private String resolveRiskLevel(String riskPreference) {
        if ("CONSERVATIVE".equalsIgnoreCase(riskPreference)) {
            return "LOW";
        }
        if ("AGGRESSIVE".equalsIgnoreCase(riskPreference)) {
            return "MEDIUM_HIGH";
        }
        return "MEDIUM";
    }

    private BigDecimal calculateStake(BigDecimal budgetAmount, int marketCount) {
        if (budgetAmount == null || marketCount <= 0) {
            return BigDecimal.ZERO;
        }
        return budgetAmount.divide(BigDecimal.valueOf(marketCount), 2, RoundingMode.DOWN);
    }
}
