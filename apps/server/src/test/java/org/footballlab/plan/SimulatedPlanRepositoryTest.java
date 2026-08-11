package org.footballlab.plan;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSnapshotResponse;
import org.footballlab.plan.repository.JdbcSimulatedPlanRepository;
import org.footballlab.plan.repository.SimulatedPlanRepository;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class SimulatedPlanRepositoryTest {

    @Autowired
    private SimulatedPlanRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldPersistGeneratedAndSavedPlanWithItemsAndReadItWithANewRepositoryInstance() {
        String suffix = UUID.randomUUID().toString();
        String planId = "sim-plan-repo-" + suffix;
        String itemId = "sim-item-repo-" + suffix;
        StrategyParameterRequest strategyParameters = new StrategyParameterRequest(
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
                "BALANCED");
        SimulatedPlanItemResponse generatedItem = new SimulatedPlanItemResponse(
                itemId,
                "demo-match-001",
                "2026-07-01",
                "Fictional Coastal League",
                "Northport United",
                "Lakeside City",
                "2026-07-01T19:30:00+08:00",
                "WIN_DRAW_LOSS",
                "HOME_WIN",
                BigDecimal.valueOf(2.05),
                BigDecimal.valueOf(10),
                "GENERATED",
                "模拟选择，用于验证方案明细落库。");
        SimulatedPlanSnapshotResponse generatedSnapshot = new SimulatedPlanSnapshotResponse(
                "sim-snapshot-repo-" + suffix,
                "snapshot-repo-" + suffix,
                "analysis-repo-" + suffix,
                "USER_SCREENSHOT_CONFIRMED",
                "MOCK_RULE_ENGINE",
                "GENERATED",
                strategyParameters,
                1,
                "GENERATED",
                "2026-06-26T11:05:00+08:00");
        SimulatedPlanResponse generatedPlan = new SimulatedPlanResponse(
                planId,
                "SIMULATED_ONLY",
                "GENERATED",
                "analysis-repo-" + suffix,
                "snapshot-repo-" + suffix,
                "CNY",
                BigDecimal.valueOf(20),
                strategyParameters,
                List.of("GENERATED"),
                List.of(generatedItem),
                generatedSnapshot,
                "非官方，仅模拟保存与复盘流程验证；不构成确定性建议。",
                null,
                "2026-06-26T11:05:00+08:00",
                "2026-06-26T11:05:00+08:00");

        repository.savePlan(generatedPlan);

        SimulatedPlanItemResponse savedItem = new SimulatedPlanItemResponse(
                generatedItem.planItemId(),
                generatedItem.matchId(),
                generatedItem.matchDate(),
                generatedItem.league(),
                generatedItem.homeTeam(),
                generatedItem.awayTeam(),
                generatedItem.kickoffTime(),
                generatedItem.playType(),
                generatedItem.selection(),
                generatedItem.odds(),
                generatedItem.stakeAmount(),
                "PENDING_RESULT",
                generatedItem.note());
        SimulatedPlanResponse savedPlan = new SimulatedPlanResponse(
                generatedPlan.planId(),
                generatedPlan.planType(),
                "PENDING_RESULT",
                generatedPlan.reportId(),
                generatedPlan.snapshotId(),
                generatedPlan.currency(),
                generatedPlan.budgetAmount(),
                generatedPlan.strategyParameters(),
                List.of("GENERATED", "SAVED", "PENDING_RESULT"),
                List.of(savedItem),
                new SimulatedPlanSnapshotResponse(
                        generatedSnapshot.planSnapshotId(),
                        generatedSnapshot.snapshotId(),
                        generatedSnapshot.reportId(),
                        generatedSnapshot.inputSourceType(),
                        generatedSnapshot.engineType(),
                        generatedSnapshot.sourceReportStatus(),
                        generatedSnapshot.strategyParameters(),
                        generatedSnapshot.selectionCount(),
                        "PENDING_RESULT",
                        generatedSnapshot.capturedAt()),
                generatedPlan.complianceNotice(),
                "保存为等待公开赛果阶段的模拟方案。",
                generatedPlan.createdAt(),
                "2026-06-26T11:06:00+08:00");
        repository.savePlan(savedPlan);

        SimulatedPlanRepository reloadedRepository = new JdbcSimulatedPlanRepository(jdbcTemplate, objectMapper);

        assertThat(reloadedRepository.findPlan(planId)).contains(savedPlan);
        assertThat(reloadedRepository.listSavedPlans())
                .extracting(SimulatedPlanResponse::planId)
                .contains(planId);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from simulated_plan_item where plan_id = ?",
                Integer.class,
                planId)).isEqualTo(1);
        assertThat(reloadedRepository.nextPlanSequence()).isGreaterThanOrEqualTo(1L);
        assertThat(reloadedRepository.nextPlanItemSequence()).isGreaterThanOrEqualTo(1L);
    }
}
