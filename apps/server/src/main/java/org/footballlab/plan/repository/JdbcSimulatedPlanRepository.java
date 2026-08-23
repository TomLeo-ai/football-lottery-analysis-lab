package org.footballlab.plan.repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.plan.domain.SimulatedPlanItemResponse;
import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.domain.SimulatedPlanSnapshotResponse;
import org.footballlab.plan.persistence.LegacySimulatedPlanAdapter;
import org.footballlab.plan.persistence.SimulatedPlanPayloadV2;
import org.footballlab.plan.persistence.SimulatedPlanV2Record;
import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcSimulatedPlanRepository implements SimulatedPlanRepository {

    private static final String PLAN_PREFIX = "sim-plan-";
    private static final String ITEM_PREFIX = "sim-item-";
    private static final String STATUS_GENERATED = "GENERATED";
    private static final String STATUS_PENDING_RESULT = "PENDING_RESULT";
    private static final String V2_INTEGRITY_ERROR = "Simulated plan v2 integrity check failed.";

    private static final String SELECT_HEADER = """
            select plan_id,
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
                   updated_at,
                   workflow_id,
                   authority_type,
                   schema_version
            from simulated_plan
            """;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcSimulatedPlanRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void savePlan(SimulatedPlanResponse plan) {
        requireLegacyPlan(plan);
        Optional<PlanHeader> existing = findHeaderById(plan.planId());
        if (existing.isEmpty()) {
            if (!STATUS_GENERATED.equals(plan.planStatus())) {
                throw new IllegalStateException("A legacy simulated plan must first be stored as GENERATED.");
            }
            insertLegacyHeader(plan);
            insertItems(plan.planId(), plan.items(), plan.createdAt());
            return;
        }

        PlanHeader header = existing.orElseThrow();
        if (header.isV2Candidate()) {
            throw integrityFailure();
        }
        if (!STATUS_GENERATED.equals(header.planStatus()) || !STATUS_PENDING_RESULT.equals(plan.planStatus())) {
            throw new IllegalStateException("Legacy simulated plan transition must be GENERATED to PENDING_RESULT.");
        }
        SimulatedPlanResponse stored = mapLegacy(header);
        SimulatedPlanResponse pending = legacyPendingResult(stored, plan.operatorNote(), plan.updatedAt());
        int updated = updatePendingHeader(pending, STATUS_GENERATED);
        if (updated != 1) {
            throw new IllegalStateException("Legacy simulated plan transition conflicted with current state.");
        }
    }

    @Override
    public Optional<SimulatedPlanResponse> findPlan(String planId) {
        return findAnyById(planId);
    }

    @Override
    public List<SimulatedPlanResponse> listSavedPlans() {
        List<String> planIds = jdbcTemplate.queryForList(
                """
                        select plan_id
                        from simulated_plan
                        where plan_status in (?, ?)
                        order by updated_at desc, plan_id
                        """,
                String.class,
                STATUS_PENDING_RESULT,
                "PENDING");
        return planIds.stream()
                .map(this::findAnyById)
                .flatMap(Optional::stream)
                .toList();
    }

    @Override
    @Transactional
    public void insertGeneratedPlan(SimulatedPlanV2Record plan) {
        Objects.requireNonNull(plan, "plan must not be null");
        if (!STATUS_GENERATED.equals(plan.planStatus())) {
            throw new IllegalArgumentException("insertGeneratedPlan requires a GENERATED v2 plan.");
        }
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
                            updated_at,
                            workflow_id,
                            authority_type,
                            provenance_json,
                            schema_version
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                toJson(plan.toPayload()),
                plan.createdAt(),
                plan.updatedAt(),
                plan.workflowId(),
                plan.authorityType(),
                "{}",
                SimulatedPlanPayloadV2.SCHEMA_VERSION);
        insertItems(plan.planId(), plan.items(), plan.createdAt());
    }

    @Override
    @Transactional
    public boolean transitionToPendingResult(String planId, String operatorNote, String updatedAt) {
        Optional<SimulatedPlanV2Record> current = findV2ById(planId);
        if (current.isEmpty() || !STATUS_GENERATED.equals(current.orElseThrow().planStatus())) {
            return false;
        }
        SimulatedPlanV2Record pending = current.orElseThrow().toPendingResult(operatorNote, updatedAt);
        return updatePendingHeader(pending.toResponse(), STATUS_GENERATED) == 1;
    }

    @Override
    public Optional<SimulatedPlanV2Record> findV2ById(String planId) {
        Optional<PlanHeader> header = findHeaderById(planId);
        if (header.isEmpty() || !header.orElseThrow().isV2Candidate()) {
            return Optional.empty();
        }
        return Optional.of(mapV2(header.orElseThrow()));
    }

    @Override
    public Optional<SimulatedPlanV2Record> findV2ByReportId(String reportId) {
        List<PlanHeader> candidates = jdbcTemplate.query(
                SELECT_HEADER + " where report_id = ? order by plan_id",
                (resultSet, rowNumber) -> mapHeader(resultSet),
                reportId).stream()
                .filter(PlanHeader::isV2Candidate)
                .toList();
        if (candidates.isEmpty()) {
            return Optional.empty();
        }
        if (candidates.size() != 1) {
            throw integrityFailure();
        }
        return Optional.of(mapV2(candidates.get(0)));
    }

    @Override
    public Optional<SimulatedPlanResponse> findAnyById(String planId) {
        Optional<PlanHeader> header = findHeaderById(planId);
        if (header.isEmpty()) {
            return Optional.empty();
        }
        PlanHeader value = header.orElseThrow();
        if (value.isV2Candidate()) {
            return Optional.of(mapV2(value).toResponse());
        }
        return Optional.of(mapLegacy(value));
    }

    @Override
    public long nextPlanSequence() {
        return nextSequence("select plan_id from simulated_plan where plan_id like ?", PLAN_PREFIX);
    }

    @Override
    public long nextPlanItemSequence() {
        return nextSequence("select plan_item_id from simulated_plan_item where plan_item_id like ?", ITEM_PREFIX);
    }

    private void insertLegacyHeader(SimulatedPlanResponse plan) {
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

    private int updatePendingHeader(SimulatedPlanResponse pending, String expectedStatus) {
        return jdbcTemplate.update("""
                        update simulated_plan
                        set plan_status = ?,
                            status_flow_json = ?,
                            plan_snapshot_json = ?,
                            operator_note = ?,
                            payload_json = ?,
                            updated_at = ?
                        where plan_id = ?
                          and plan_status = ?
                        """,
                pending.planStatus(),
                toJson(pending.statusFlow()),
                toJson(pending.snapshot()),
                pending.operatorNote(),
                pendingPayload(pending),
                pending.updatedAt(),
                pending.planId(),
                expectedStatus);
    }

    private String pendingPayload(SimulatedPlanResponse pending) {
        Optional<PlanHeader> header = findHeaderById(pending.planId());
        if (header.isPresent() && header.orElseThrow().isV2Candidate()) {
            PlanHeader value = header.orElseThrow();
            return toJson(new SimulatedPlanPayloadV2(
                    SimulatedPlanPayloadV2.SCHEMA_VERSION,
                    value.workflowId(),
                    value.authorityType(),
                    pending.planId(),
                    pending.planType(),
                    pending.planStatus(),
                    pending.reportId(),
                    pending.snapshotId(),
                    pending.currency(),
                    pending.budgetAmount(),
                    pending.strategyParameters(),
                    pending.statusFlow(),
                    pending.items(),
                    pending.snapshot(),
                    pending.complianceNotice(),
                    pending.operatorNote(),
                    pending.createdAt(),
                    pending.updatedAt()));
        }
        return toJson(pending);
    }

    private SimulatedPlanResponse legacyPendingResult(
            SimulatedPlanResponse stored,
            String operatorNote,
            String updatedAt) {
        SimulatedPlanSnapshotResponse snapshot = stored.snapshot();
        SimulatedPlanSnapshotResponse pendingSnapshot = snapshot == null
                ? null
                : new SimulatedPlanSnapshotResponse(
                        snapshot.planSnapshotId(),
                        snapshot.snapshotId(),
                        snapshot.reportId(),
                        snapshot.inputSourceType(),
                        snapshot.engineType(),
                        snapshot.sourceReportStatus(),
                        snapshot.strategyParameters(),
                        snapshot.selectionCount(),
                        STATUS_PENDING_RESULT,
                        snapshot.capturedAt());
        return new SimulatedPlanResponse(
                stored.planId(),
                stored.planType(),
                STATUS_PENDING_RESULT,
                stored.reportId(),
                stored.snapshotId(),
                stored.currency(),
                stored.budgetAmount(),
                stored.strategyParameters(),
                List.of(STATUS_GENERATED, "SAVED", STATUS_PENDING_RESULT),
                stored.items(),
                pendingSnapshot,
                stored.complianceNotice(),
                operatorNote,
                stored.createdAt(),
                updatedAt);
    }

    private SimulatedPlanResponse mapLegacy(PlanHeader header) {
        String visiblePlanStatus = visibleLegacyStatus(header.planStatus());
        StrategyParameterRequest strategy = fromJsonNullable(
                header.strategyParametersJson(),
                StrategyParameterRequest.class);
        List<String> statusFlow = readLegacyStatusFlow(header.statusFlowJson(), visiblePlanStatus);
        SimulatedPlanSnapshotResponse snapshot = readLegacySnapshot(header);
        SimulatedPlanResponse reconstructed = new SimulatedPlanResponse(
                header.planId(),
                header.planType(),
                visiblePlanStatus,
                header.reportId(),
                header.snapshotId(),
                header.currency(),
                header.budgetAmount(),
                strategy,
                statusFlow,
                readItemRows(header.planId(), false),
                snapshot,
                header.complianceNotice(),
                header.operatorNote(),
                header.createdAt(),
                header.updatedAt());
        return LegacySimulatedPlanAdapter.adapt(reconstructed);
    }

    private String visibleLegacyStatus(String storedStatus) {
        return "PENDING".equals(storedStatus) ? STATUS_PENDING_RESULT : storedStatus;
    }

    private List<String> readLegacyStatusFlow(String value, String visiblePlanStatus) {
        if (STATUS_PENDING_RESULT.equals(visiblePlanStatus)) {
            return List.of(STATUS_GENERATED, "SAVED", STATUS_PENDING_RESULT);
        }
        try {
            List<String> stored = fromJsonList(
                    value,
                    new TypeReference<List<String>>() {
                    });
            return stored.isEmpty() && visiblePlanStatus != null
                    ? List.of(visiblePlanStatus)
                    : stored;
        } catch (RuntimeException ignored) {
            return visiblePlanStatus == null ? List.of() : List.of(visiblePlanStatus);
        }
    }

    private SimulatedPlanSnapshotResponse readLegacySnapshot(PlanHeader header) {
        try {
            SimulatedPlanSnapshotResponse snapshot = fromJsonNullable(
                    header.planSnapshotJson(),
                    SimulatedPlanSnapshotResponse.class);
            if (snapshot == null
                    || !Objects.equals(header.reportId(), snapshot.reportId())
                    || !Objects.equals(header.snapshotId(), snapshot.snapshotId())) {
                return null;
            }
            return snapshot;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private SimulatedPlanV2Record mapV2(PlanHeader header) {
        try {
            if (header.workflowId() == null
                    || !SimulatedPlanV2Record.AUTHORITY_TYPE.equals(header.authorityType())
                    || !SimulatedPlanPayloadV2.SCHEMA_VERSION.equals(header.schemaVersion())) {
                throw integrityFailure();
            }
            StrategyParameterRequest strategy = fromJsonRequired(
                    header.strategyParametersJson(),
                    StrategyParameterRequest.class);
            List<String> statusFlow = fromJsonRequiredList(
                    header.statusFlowJson(),
                    new TypeReference<List<String>>() {
                    });
            SimulatedPlanSnapshotResponse snapshot = fromJsonRequired(
                    header.planSnapshotJson(),
                    SimulatedPlanSnapshotResponse.class);
            List<SimulatedPlanItemResponse> items = readItemRows(header.planId(), true);
            SimulatedPlanPayloadV2 payload = fromJsonRequired(
                    header.payloadJson(),
                    SimulatedPlanPayloadV2.class);
            validatePayload(header, strategy, statusFlow, snapshot, items, payload);
            return new SimulatedPlanV2Record(
                    header.workflowId(),
                    header.authorityType(),
                    header.planId(),
                    header.planType(),
                    header.planStatus(),
                    header.reportId(),
                    header.snapshotId(),
                    header.currency(),
                    header.budgetAmount(),
                    strategy,
                    statusFlow,
                    items,
                    snapshot,
                    header.complianceNotice(),
                    header.operatorNote(),
                    header.createdAt(),
                    header.updatedAt());
        } catch (RuntimeException exception) {
            if (V2_INTEGRITY_ERROR.equals(exception.getMessage())) {
                throw exception;
            }
            throw integrityFailure(exception);
        }
    }

    private void validatePayload(
            PlanHeader header,
            StrategyParameterRequest strategy,
            List<String> statusFlow,
            SimulatedPlanSnapshotResponse snapshot,
            List<SimulatedPlanItemResponse> items,
            SimulatedPlanPayloadV2 payload) {
        requireMatch(SimulatedPlanPayloadV2.SCHEMA_VERSION, payload.schemaVersion());
        requireMatch(header.schemaVersion(), payload.schemaVersion());
        requireMatch(header.workflowId(), payload.workflowId());
        requireMatch(header.authorityType(), payload.authorityType());
        requireMatch(header.planId(), payload.planId());
        requireMatch(header.planType(), payload.planType());
        requireMatch(header.planStatus(), payload.planStatus());
        requireMatch(header.reportId(), payload.reportId());
        requireMatch(header.snapshotId(), payload.snapshotId());
        requireMatch(header.currency(), payload.currency());
        requireDecimalMatch(header.budgetAmount(), payload.budgetAmount());
        requireStrategyMatch(strategy, payload.strategyParameters());
        requireMatch(statusFlow, payload.statusFlow());
        requireItemsMatch(items, payload.items());
        requireSnapshotMatch(snapshot, payload.snapshot());
        requireMatch(header.complianceNotice(), payload.complianceNotice());
        requireMatch(header.operatorNote(), payload.operatorNote());
        requireMatch(header.createdAt(), payload.createdAt());
        requireMatch(header.updatedAt(), payload.updatedAt());
    }

    private List<SimulatedPlanItemResponse> readItemRows(String planId, boolean validatePayload) {
        return jdbcTemplate.query("""
                        select plan_item_id,
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
                               payload_json
                        from simulated_plan_item
                        where plan_id = ?
                        order by plan_item_id
                        """,
                (resultSet, rowNumber) -> {
                    SimulatedPlanItemResponse row = mapItem(resultSet);
                    if (validatePayload) {
                        SimulatedPlanItemResponse payload = fromJsonRequired(
                                resultSet.getString("payload_json"),
                                SimulatedPlanItemResponse.class);
                        requireItemMatch(row, payload);
                    }
                    return row;
                },
                planId);
    }

    private SimulatedPlanItemResponse mapItem(ResultSet resultSet) throws SQLException {
        return new SimulatedPlanItemResponse(
                resultSet.getString("plan_item_id"),
                resultSet.getString("match_id"),
                resultSet.getString("match_date"),
                resultSet.getString("league"),
                resultSet.getString("home_team"),
                resultSet.getString("away_team"),
                resultSet.getString("kickoff_time"),
                resultSet.getString("play_type"),
                resultSet.getString("selection"),
                resultSet.getBigDecimal("odds"),
                resultSet.getBigDecimal("stake_amount"),
                resultSet.getString("item_status"),
                resultSet.getString("note"));
    }

    private void insertItems(String planId, List<SimulatedPlanItemResponse> items, String createdAt) {
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
                    public void setValues(PreparedStatement statement, int index) throws SQLException {
                        SimulatedPlanItemResponse item = items.get(index);
                        statement.setString(1, item.planItemId());
                        statement.setString(2, planId);
                        statement.setString(3, item.matchId());
                        statement.setString(4, item.matchDate());
                        statement.setString(5, item.league());
                        statement.setString(6, item.homeTeam());
                        statement.setString(7, item.awayTeam());
                        statement.setString(8, item.kickoffTime());
                        statement.setString(9, item.playType());
                        statement.setString(10, item.selection());
                        statement.setBigDecimal(11, item.odds());
                        statement.setBigDecimal(12, item.stakeAmount());
                        statement.setString(13, item.itemStatus());
                        statement.setString(14, item.note());
                        statement.setString(15, toJson(item));
                        statement.setString(16, createdAt);
                    }

                    @Override
                    public int getBatchSize() {
                        return items.size();
                    }
                });
    }

    private Optional<PlanHeader> findHeaderById(String planId) {
        try {
            return Optional.ofNullable(jdbcTemplate.queryForObject(
                    SELECT_HEADER + " where plan_id = ?",
                    (resultSet, rowNumber) -> mapHeader(resultSet),
                    planId));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    private PlanHeader mapHeader(ResultSet resultSet) throws SQLException {
        return new PlanHeader(
                resultSet.getString("plan_id"),
                resultSet.getString("plan_type"),
                resultSet.getString("plan_status"),
                resultSet.getString("report_id"),
                resultSet.getString("snapshot_id"),
                resultSet.getString("currency"),
                resultSet.getBigDecimal("budget_amount"),
                resultSet.getString("strategy_parameters_json"),
                resultSet.getString("status_flow_json"),
                resultSet.getString("plan_snapshot_json"),
                resultSet.getString("compliance_notice"),
                resultSet.getString("operator_note"),
                resultSet.getString("payload_json"),
                resultSet.getString("created_at"),
                resultSet.getString("updated_at"),
                resultSet.getString("workflow_id"),
                resultSet.getString("authority_type"),
                resultSet.getString("schema_version"));
    }

    private void requireLegacyPlan(SimulatedPlanResponse plan) {
        if (plan == null || plan.planId() == null || plan.planId().isBlank()) {
            throw new IllegalArgumentException("Legacy simulated plan and planId are required.");
        }
        if (plan.items() == null) {
            throw new IllegalArgumentException("Legacy simulated plan items are required.");
        }
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
            throw new IllegalStateException("Failed to serialize simulated plan persistence payload.", exception);
        }
    }

    private <T> T fromJsonRequired(String value, Class<T> type) {
        if (value == null || value.isBlank()) {
            throw integrityFailure();
        }
        try {
            T result = objectMapper.readValue(value, type);
            if (result == null) {
                throw integrityFailure();
            }
            return result;
        } catch (JsonProcessingException exception) {
            throw integrityFailure(exception);
        }
    }

    private <T> T fromJsonNullable(String value, Class<T> type) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize legacy simulated plan projection.", exception);
        }
    }

    private <T> List<T> fromJsonRequiredList(String value, TypeReference<List<T>> type) {
        if (value == null || value.isBlank()) {
            throw integrityFailure();
        }
        try {
            List<T> result = objectMapper.readValue(value, type);
            if (result == null) {
                throw integrityFailure();
            }
            return List.copyOf(result);
        } catch (JsonProcessingException exception) {
            throw integrityFailure(exception);
        }
    }

    private <T> List<T> fromJsonList(String value, TypeReference<List<T>> type) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            List<T> result = objectMapper.readValue(value, type);
            return result == null ? List.of() : List.copyOf(result);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize legacy simulated plan list projection.", exception);
        }
    }

    private void requireItemsMatch(
            List<SimulatedPlanItemResponse> columnItems,
            List<SimulatedPlanItemResponse> payloadItems) {
        if (payloadItems == null || columnItems.size() != payloadItems.size()) {
            throw integrityFailure();
        }
        for (int index = 0; index < columnItems.size(); index++) {
            requireItemMatch(columnItems.get(index), payloadItems.get(index));
        }
    }

    private void requireItemMatch(SimulatedPlanItemResponse column, SimulatedPlanItemResponse payload) {
        if (payload == null) {
            throw integrityFailure();
        }
        requireMatch(column.planItemId(), payload.planItemId());
        requireMatch(column.matchId(), payload.matchId());
        requireMatch(column.matchDate(), payload.matchDate());
        requireMatch(column.league(), payload.league());
        requireMatch(column.homeTeam(), payload.homeTeam());
        requireMatch(column.awayTeam(), payload.awayTeam());
        requireMatch(column.kickoffTime(), payload.kickoffTime());
        requireMatch(column.playType(), payload.playType());
        requireMatch(column.selection(), payload.selection());
        requireDecimalMatch(column.odds(), payload.odds());
        requireDecimalMatch(column.stakeAmount(), payload.stakeAmount());
        requireMatch(column.itemStatus(), payload.itemStatus());
        requireMatch(column.note(), payload.note());
    }

    private void requireSnapshotMatch(
            SimulatedPlanSnapshotResponse column,
            SimulatedPlanSnapshotResponse payload) {
        if (column == null || payload == null) {
            if (column != payload) {
                throw integrityFailure();
            }
            return;
        }
        requireMatch(column.planSnapshotId(), payload.planSnapshotId());
        requireMatch(column.snapshotId(), payload.snapshotId());
        requireMatch(column.reportId(), payload.reportId());
        requireMatch(column.inputSourceType(), payload.inputSourceType());
        requireMatch(column.engineType(), payload.engineType());
        requireMatch(column.sourceReportStatus(), payload.sourceReportStatus());
        requireStrategyMatch(column.strategyParameters(), payload.strategyParameters());
        requireMatch(column.selectionCount(), payload.selectionCount());
        requireMatch(column.snapshotStatus(), payload.snapshotStatus());
        requireMatch(column.capturedAt(), payload.capturedAt());
    }

    private void requireStrategyMatch(StrategyParameterRequest first, StrategyParameterRequest second) {
        if (first == null || second == null) {
            if (first != second) {
                throw integrityFailure();
            }
            return;
        }
        requireDecimalMatch(first.budgetAmount(), second.budgetAmount());
        requireMatch(first.currency(), second.currency());
        requireMatch(first.targetTicketCount(), second.targetTicketCount());
        requireMatch(first.minTicketCount(), second.minTicketCount());
        requireMatch(first.maxTicketCount(), second.maxTicketCount());
        requireMatch(first.riskPreference(), second.riskPreference());
        requireDecimalMatch(first.mainTicketRatio(), second.mainTicketRatio());
        requireDecimalMatch(first.defensiveTicketRatio(), second.defensiveTicketRatio());
        requireDecimalMatch(first.entertainmentTicketRatio(), second.entertainmentTicketRatio());
        requireMatch(first.enableEntertainmentTicket(), second.enableEntertainmentTicket());
        requireDecimalMatch(first.entertainmentTicketMaxCost(), second.entertainmentTicketMaxCost());
        requireMatch(first.maxParlayLegs(), second.maxParlayLegs());
        requireMatch(first.preferredPlayTypes(), second.preferredPlayTypes());
        requireMatch(first.excludedPlayTypes(), second.excludedPlayTypes());
        requireMatch(first.exactScorePolicy(), second.exactScorePolicy());
        requireDecimalMatch(first.minPayoutRequirement(), second.minPayoutRequirement());
        requireMatch(first.allowLowReturnTicket(), second.allowLowReturnTicket());
        requireMatch(first.upsetCoverageLevel(), second.upsetCoverageLevel());
    }

    private void requireDecimalMatch(BigDecimal first, BigDecimal second) {
        if (first == null ? second != null : second == null || first.compareTo(second) != 0) {
            throw integrityFailure();
        }
    }

    private void requireMatch(Object first, Object second) {
        if (!Objects.equals(first, second)) {
            throw integrityFailure();
        }
    }

    private IllegalStateException integrityFailure() {
        return new IllegalStateException(V2_INTEGRITY_ERROR);
    }

    private IllegalStateException integrityFailure(Throwable cause) {
        return new IllegalStateException(V2_INTEGRITY_ERROR, cause);
    }

    private record PlanHeader(
            String planId,
            String planType,
            String planStatus,
            String reportId,
            String snapshotId,
            String currency,
            BigDecimal budgetAmount,
            String strategyParametersJson,
            String statusFlowJson,
            String planSnapshotJson,
            String complianceNotice,
            String operatorNote,
            String payloadJson,
            String createdAt,
            String updatedAt,
            String workflowId,
            String authorityType,
            String schemaVersion) {

        private boolean isV2Candidate() {
            return workflowId != null || authorityType != null || schemaVersion != null;
        }
    }
}
