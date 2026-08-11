package org.footballlab.plan.repository;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcSimulatedPlanRepository implements SimulatedPlanRepository {

    private static final String PLAN_PREFIX = "sim-plan-";
    private static final String ITEM_PREFIX = "sim-item-";
    private static final String STATUS_PENDING_RESULT = "PENDING_RESULT";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcSimulatedPlanRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void savePlan(SimulatedPlanResponse plan) {
        int updatedRows = jdbcTemplate.update("""
                        update simulated_plan
                        set plan_type = ?,
                            plan_status = ?,
                            report_id = ?,
                            snapshot_id = ?,
                            currency = ?,
                            budget_amount = ?,
                            strategy_parameters_json = ?,
                            status_flow_json = ?,
                            plan_snapshot_json = ?,
                            compliance_notice = ?,
                            operator_note = ?,
                            payload_json = ?,
                            created_at = ?,
                            updated_at = ?
                        where plan_id = ?
                        """,
                plan.planType(),
                plan.planStatus(),
                plan.reportId(),
                plan.snapshotId(),
                plan.currency(),
                plan.budgetAmount(),
                toJson(plan.strategyParameters()),
                toJson(plan.statusFlow()),
                toJson(plan.snapshot()),
                plan.complianceNotice(),
                plan.operatorNote(),
                toJson(plan),
                plan.createdAt(),
                plan.updatedAt(),
                plan.planId());

        if (updatedRows == 0) {
            jdbcTemplate.update("""
                            insert into simulated_plan (
                                plan_id,
                                plan_type,
                                plan_status,
                                report_id,
                                snapshot_id,
                                currency,
                                budget_amount,
                                strategy_parameters_json,
                                status_flow_json,
                                plan_snapshot_json,
                                compliance_notice,
                                operator_note,
                                payload_json,
                                created_at,
                                updated_at
                            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                    plan.planId(),
                    plan.planType(),
                    plan.planStatus(),
                    plan.reportId(),
                    plan.snapshotId(),
                    plan.currency(),
                    plan.budgetAmount(),
                    toJson(plan.strategyParameters()),
                    toJson(plan.statusFlow()),
                    toJson(plan.snapshot()),
                    plan.complianceNotice(),
                    plan.operatorNote(),
                    toJson(plan),
                    plan.createdAt(),
                    plan.updatedAt());
        }

        jdbcTemplate.update("delete from simulated_plan_item where plan_id = ?", plan.planId());
        insertItems(plan);
    }

    @Override
    public Optional<SimulatedPlanResponse> findPlan(String planId) {
        try {
            String payload = jdbcTemplate.queryForObject(
                    "select payload_json from simulated_plan where plan_id = ?",
                    String.class,
                    planId);
            return Optional.of(fromJson(payload));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    @Override
    public List<SimulatedPlanResponse> listSavedPlans() {
        return jdbcTemplate.query(
                """
                        select payload_json
                        from simulated_plan
                        where plan_status = ?
                        order by updated_at desc
                        """,
                (resultSet, rowNumber) -> fromJson(resultSet.getString("payload_json")),
                STATUS_PENDING_RESULT);
    }

    @Override
    public long nextPlanSequence() {
        return nextSequence("select plan_id from simulated_plan where plan_id like ?", PLAN_PREFIX);
    }

    @Override
    public long nextPlanItemSequence() {
        return nextSequence("select plan_item_id from simulated_plan_item where plan_item_id like ?", ITEM_PREFIX);
    }

    private void insertItems(SimulatedPlanResponse plan) {
        jdbcTemplate.batchUpdate("""
                        insert into simulated_plan_item (
                            plan_item_id,
                            plan_id,
                            match_id,
                            match_date,
                            league,
                            home_team,
                            away_team,
                            kickoff_time,
                            play_type,
                            selection,
                            odds,
                            stake_amount,
                            item_status,
                            note,
                            payload_json,
                            created_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                new BatchPreparedStatementSetter() {
                    @Override
                    public void setValues(PreparedStatement preparedStatement, int index) throws SQLException {
                        SimulatedPlanItemResponse item = plan.items().get(index);
                        preparedStatement.setString(1, item.planItemId());
                        preparedStatement.setString(2, plan.planId());
                        preparedStatement.setString(3, item.matchId());
                        preparedStatement.setString(4, item.matchDate());
                        preparedStatement.setString(5, item.league());
                        preparedStatement.setString(6, item.homeTeam());
                        preparedStatement.setString(7, item.awayTeam());
                        preparedStatement.setString(8, item.kickoffTime());
                        preparedStatement.setString(9, item.playType());
                        preparedStatement.setString(10, item.selection());
                        preparedStatement.setBigDecimal(11, item.odds());
                        preparedStatement.setBigDecimal(12, item.stakeAmount());
                        preparedStatement.setString(13, item.itemStatus());
                        preparedStatement.setString(14, item.note());
                        preparedStatement.setString(15, toJson(item));
                        preparedStatement.setString(16, plan.createdAt());
                    }

                    @Override
                    public int getBatchSize() {
                        return plan.items().size();
                    }
                });
    }

    private long nextSequence(String sql, String prefix) {
        List<String> ids = jdbcTemplate.queryForList(sql, String.class, prefix + "%");
        return ids.stream()
                .map(id -> parseSequence(id, prefix))
                .flatMap(Optional::stream)
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L) + 1L;
    }

    private Optional<Long> parseSequence(String value, String prefix) {
        if (value == null || !value.startsWith(prefix)) {
            return Optional.empty();
        }
        try {
            return Optional.of(Long.parseLong(value.substring(prefix.length())));
        } catch (NumberFormatException ignored) {
            return Optional.empty();
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize simulated plan payload.", exception);
        }
    }

    private SimulatedPlanResponse fromJson(String value) {
        try {
            return objectMapper.readValue(value, SimulatedPlanResponse.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize simulated plan payload.", exception);
        }
    }
}
