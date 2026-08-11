package org.footballlab.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.domain.AnalysisReportResponse;
import org.footballlab.analysis.domain.ProbabilityInsightResponse;
import org.footballlab.analysis.domain.RiskWarningResponse;
import org.footballlab.analysis.domain.SimulatedSelectionResponse;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.analysis.repository.JdbcAnalysisReportRepository;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class AnalysisReportRepositoryTest {

    @Autowired
    private AnalysisReportRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldPersistAnalysisReportAndReadItWithANewRepositoryInstance() {
        String suffix = UUID.randomUUID().toString();
        AnalysisReportResponse report = new AnalysisReportResponse(
                "analysis-repo-" + suffix,
                "snapshot-repo-" + suffix,
                "USER_SCREENSHOT_CONFIRMED",
                "MOCK_RULE_ENGINE",
                "GENERATED",
                new StrategyParameterRequest(
                        BigDecimal.valueOf(20).setScale(2),
                        "CNY",
                        5,
                        5,
                        6,
                        "BALANCED",
                        BigDecimal.valueOf(0.6),
                        BigDecimal.valueOf(0.3),
                        BigDecimal.valueOf(0.1),
                        true,
                        BigDecimal.valueOf(2).setScale(2),
                        4,
                        List.of("WIN_DRAW_LOSS", "HANDICAP_WIN_DRAW_LOSS"),
                        List.of(),
                        "ENTERTAINMENT_ONLY",
                        null,
                        false,
                        "BALANCED"),
                List.of(new ProbabilityInsightResponse(
                        "demo-match-001",
                        "2026-07-01",
                        "Fictional Coastal League",
                        "2026-07-01T19:30:00+08:00",
                        "Northport United",
                        "Lakeside City",
                        "HOME_WIN",
                        "MEDIUM",
                        "Repository persistence test.")),
                List.of(new RiskWarningResponse(
                        "INFO_RISK",
                        "MEDIUM",
                        "仅基于用户确认快照与虚构样例字段。")),
                List.of(new SimulatedSelectionResponse(
                        "demo-match-001",
                        "WIN_DRAW_LOSS",
                        "HOME_WIN",
                        BigDecimal.valueOf(2.05),
                        BigDecimal.valueOf(10),
                        "模拟选择，用于验证分析报告落库。")),
                "非官方，仅模拟分析/复盘；仅供技术研究和流程验证，不构成确定性建议。",
                "2026-06-26T11:00:00+08:00",
                null,
                null,
                null,
                "PASSED",
                null,
                null);

        repository.save(report);

        AnalysisReportRepository reloadedRepository = new JdbcAnalysisReportRepository(jdbcTemplate, objectMapper);

        assertThat(reloadedRepository.findById(report.reportId()))
                .isPresent()
                .get()
                .satisfies(reloaded -> {
                    assertThat(reloaded.reportId()).isEqualTo(report.reportId());
                    assertThat(reloaded.engineType()).isEqualTo("MOCK_RULE_ENGINE");
                    assertThat(reloaded.reportStatus()).isEqualTo("GENERATED");
                    assertThat(reloaded.strategyParameters().budgetAmount()).isEqualByComparingTo("20.00");
                    assertThat(reloaded.probabilityAnalysis()).hasSize(1);
                    assertThat(reloaded.simulatedSelections()).hasSize(1);
                    assertThat(reloaded.safetyStatus()).isEqualTo("PASSED");
                    assertThat(reloaded.providerKey()).isNull();
                    assertThat(reloaded.llmOutput() == null || reloaded.llmOutput().isNull()).isTrue();
                });
        assertThat(reloadedRepository.nextReportSequence()).isGreaterThanOrEqualTo(1L);
    }
}
