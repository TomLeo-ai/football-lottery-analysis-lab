package org.footballlab.llm;

import static org.assertj.core.api.Assertions.assertThat;

import org.footballlab.llm.service.PromptPackService;
import org.junit.jupiter.api.Test;

class PromptPackServiceTest {

    private final PromptPackService promptPackService = new PromptPackService();

    @Test
    void shouldLoadPredictionAndSafetyPromptsFromProjectResources() {
        String predictionPrompt = promptPackService.loadPrompt("danche-prediction-v1");
        String safetyPrompt = promptPackService.loadPrompt("danche-safety-guard-v1");
        String reviewPrompt = promptPackService.loadPrompt("danche-review-insight-v1");
        String requiredComplianceNotice = "非官方模拟分析结果，仅用于技术研究和流程验证，不构成购彩建议，不承诺命中率、收益或确定性结果。";

        assertThat(predictionPrompt)
                .contains("strategyParameters")
                .contains("parameterUsage")
                .contains("scorePredictions")
                .contains("ticketGroups")
                .contains("ledgerSnapshot")
                .contains(requiredComplianceNotice)
                .contains("\"selections\": [")
                .contains("\"playType\": \"WIN_DRAW_LOSS\"")
                .contains("不得编造")
                .doesNotContain("20元")
                .doesNotContain("5到6组");
        assertThat(safetyPrompt)
                .contains("非官方足球比赛模拟分析助手")
                .contains("必须返回合法 JSON")
                .contains("禁止使用")
                .contains("strategyParameters");
        assertThat(reviewPrompt)
                .contains("settlementAuthorityNotice")
                .contains("complianceNotice")
                .contains(requiredComplianceNotice);
    }
}
