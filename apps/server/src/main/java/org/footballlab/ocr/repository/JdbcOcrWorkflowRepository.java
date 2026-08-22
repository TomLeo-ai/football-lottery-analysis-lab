package org.footballlab.ocr.repository;

import java.util.List;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.ocr.domain.OcrExtractedFieldResponse;
import org.footballlab.ocr.domain.OcrTaskResponse;
import org.footballlab.ocr.domain.ScreenshotTaskResponse;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcOcrWorkflowRepository implements OcrWorkflowRepository {

    private static final String SCREENSHOT_PREFIX = "shot-";
    private static final String OCR_PREFIX = "ocr-";
    private static final String SNAPSHOT_PREFIX = "snapshot-";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcOcrWorkflowRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void saveScreenshotTask(ScreenshotTaskResponse screenshotTask) {
        jdbcTemplate.update("""
                        insert into screenshot_task (
                            task_id,
                            file_name,
                            content_type,
                            file_size,
                            sample_label,
                            status,
                            server_ocr_enabled,
                            privacy_policy,
                            created_at,
                            payload_json
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                screenshotTask.taskId(),
                screenshotTask.fileName(),
                screenshotTask.contentType(),
                screenshotTask.fileSize(),
                screenshotTask.sampleLabel(),
                screenshotTask.status(),
                screenshotTask.serverOcrEnabled(),
                screenshotTask.privacyPolicy(),
                screenshotTask.createdAt(),
                toJson(screenshotTask));
    }

    @Override
    public void saveWorkflowScreenshotTask(
            String workflowId,
            ScreenshotTaskResponse screenshotTask,
            String sourceDeclaration,
            String sourcePolicyVersion
    ) {
        jdbcTemplate.update("""
                        insert into screenshot_task (
                            task_id,
                            file_name,
                            content_type,
                            file_size,
                            sample_label,
                            status,
                            server_ocr_enabled,
                            privacy_policy,
                            created_at,
                            payload_json,
                            workflow_id,
                            source_declaration,
                            source_policy_version,
                            authority_type,
                            provenance_json,
                            schema_version
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                screenshotTask.taskId(),
                screenshotTask.fileName(),
                screenshotTask.contentType(),
                screenshotTask.fileSize(),
                screenshotTask.sampleLabel(),
                screenshotTask.status(),
                screenshotTask.serverOcrEnabled(),
                screenshotTask.privacyPolicy(),
                screenshotTask.createdAt(),
                toJson(screenshotTask),
                workflowId,
                sourceDeclaration,
                sourcePolicyVersion,
                "USER_OWNED_AUTHORIZED",
                "{}",
                "SCREENSHOT_TASK_V2");
    }

    @Override
    public boolean existsScreenshotTask(String taskId) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from screenshot_task where task_id = ?",
                Integer.class,
                taskId);
        return count != null && count > 0;
    }

    @Override
    public Optional<ScreenshotTaskResponse> findScreenshotTask(String taskId) {
        return findPayload(
                "select payload_json from screenshot_task where task_id = ?",
                ScreenshotTaskResponse.class,
                taskId);
    }

    @Override
    public Optional<ScreenshotTaskResponse> findScreenshotTaskByWorkflowId(String workflowId) {
        try {
            return Optional.ofNullable(jdbcTemplate.queryForObject("""
                            select task_id,
                                   file_name,
                                   content_type,
                                   file_size,
                                   sample_label,
                                   status,
                                   server_ocr_enabled,
                                   privacy_policy,
                                   created_at
                            from screenshot_task
                            where workflow_id = ?
                            order by created_at asc
                            limit 1
                            """,
                    (resultSet, rowNumber) -> new ScreenshotTaskResponse(
                            resultSet.getString("task_id"),
                            resultSet.getString("file_name"),
                            resultSet.getString("content_type"),
                            resultSet.getLong("file_size"),
                            resultSet.getString("sample_label"),
                            resultSet.getString("status"),
                            resultSet.getBoolean("server_ocr_enabled"),
                            resultSet.getString("privacy_policy"),
                            resultSet.getString("created_at")),
                    workflowId));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    @Override
    public long nextScreenshotSequence() {
        return nextSequence("select task_id from screenshot_task where task_id like ?", SCREENSHOT_PREFIX);
    }

    @Override
    public void saveOcrTask(OcrTaskResponse ocrTask) {
        jdbcTemplate.update("""
                        insert into ocr_task (
                            ocr_task_id,
                            screenshot_task_id,
                            ocr_provider,
                            raw_text,
                            status,
                            analysis_allowed,
                            fields_json,
                            payload_json,
                            parsed_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                ocrTask.ocrTaskId(),
                ocrTask.screenshotTaskId(),
                ocrTask.ocrProvider(),
                ocrTask.rawText(),
                ocrTask.status(),
                ocrTask.analysisAllowed(),
                toJson(ocrTask.fields()),
                toJson(ocrTask),
                ocrTask.parsedAt());
    }

    @Override
    public void saveWorkflowOcrTask(String workflowId, OcrTaskResponse ocrTask, String candidatePayloadJson) {
        jdbcTemplate.update("""
                        insert into ocr_task (
                            ocr_task_id,
                            screenshot_task_id,
                            ocr_provider,
                            raw_text,
                            status,
                            analysis_allowed,
                            fields_json,
                            payload_json,
                            parsed_at,
                            workflow_id,
                            candidate_schema_version,
                            authority_type,
                            provenance_json
                        ) values (?, ?, ?, null, ?, ?, ?, ?, ?, ?, 'OCR_CANDIDATE_V2', 'USER_SCREENSHOT_CONFIRMED', '{}')
                        """,
                ocrTask.ocrTaskId(),
                ocrTask.screenshotTaskId(),
                ocrTask.ocrProvider(),
                ocrTask.status(),
                ocrTask.analysisAllowed(),
                toJson(ocrTask.fields()),
                candidatePayloadJson,
                ocrTask.parsedAt(),
                workflowId);
    }

    @Override
    public boolean existsOcrTask(String ocrTaskId) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from ocr_task where ocr_task_id = ?",
                Integer.class,
                ocrTaskId);
        return count != null && count > 0;
    }

    @Override
    public Optional<OcrTaskResponse> findOcrTask(String ocrTaskId) {
        return findPayload(
                "select payload_json from ocr_task where ocr_task_id = ?",
                OcrTaskResponse.class,
                ocrTaskId);
    }

    @Override
    public Optional<OcrTaskResponse> findOcrTaskSummary(String ocrTaskId) {
        try {
            return Optional.ofNullable(jdbcTemplate.queryForObject("""
                            select ocr_task_id,
                                   screenshot_task_id,
                                   ocr_provider,
                                   raw_text,
                                   status,
                                   analysis_allowed,
                                   fields_json,
                                   parsed_at
                            from ocr_task
                            where ocr_task_id = ?
                            """,
                    (resultSet, rowNumber) -> new OcrTaskResponse(
                            resultSet.getString("ocr_task_id"),
                            resultSet.getString("screenshot_task_id"),
                            resultSet.getString("ocr_provider"),
                            resultSet.getString("raw_text"),
                            resultSet.getString("status"),
                            resultSet.getBoolean("analysis_allowed"),
                            fromJsonList(resultSet.getString("fields_json")),
                            resultSet.getString("parsed_at")),
                    ocrTaskId));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    @Override
    public long nextOcrSequence() {
        return nextSequence("select ocr_task_id from ocr_task where ocr_task_id like ?", OCR_PREFIX);
    }

    @Override
    public void saveConfirmedSnapshot(UserConfirmedSnapshotResponse confirmedSnapshot) {
        jdbcTemplate.update("""
                        insert into ocr_confirmed_snapshot (
                            snapshot_id,
                            ocr_task_id,
                            source_type,
                            snapshot_status,
                            analysis_allowed,
                            risk_preference,
                            budget_amount,
                            currency,
                            matches_json,
                            markets_json,
                            payload_json,
                            confirmed_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                confirmedSnapshot.snapshotId(),
                confirmedSnapshot.ocrTaskId(),
                confirmedSnapshot.sourceType(),
                confirmedSnapshot.snapshotStatus(),
                confirmedSnapshot.analysisAllowed(),
                confirmedSnapshot.riskPreference(),
                confirmedSnapshot.budgetAmount(),
                confirmedSnapshot.currency(),
                toJson(confirmedSnapshot.matches()),
                toJson(confirmedSnapshot.markets()),
                toJson(confirmedSnapshot),
                confirmedSnapshot.confirmedAt());
    }

    @Override
    public Optional<UserConfirmedSnapshotResponse> findConfirmedSnapshot(String snapshotId) {
        return findPayload(
                "select payload_json from ocr_confirmed_snapshot where snapshot_id = ?",
                UserConfirmedSnapshotResponse.class,
                snapshotId);
    }

    @Override
    public long nextSnapshotSequence() {
        return nextSequence(
                "select snapshot_id from ocr_confirmed_snapshot where snapshot_id like ?",
                SNAPSHOT_PREFIX);
    }

    @Override
    public void clearWorkflowPayloads(String workflowId) {
        jdbcTemplate.update(
                "update screenshot_task set payload_json = null where workflow_id = ?",
                workflowId);
        jdbcTemplate.update("""
                        update ocr_task
                        set raw_text = null,
                            fields_json = null,
                            payload_json = null
                        where workflow_id = ?
                        """,
                workflowId);
        jdbcTemplate.update("delete from ocr_review_draft where workflow_id = ?", workflowId);
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

    private <T> Optional<T> findPayload(String sql, Class<T> type, String id) {
        try {
            String payload = jdbcTemplate.queryForObject(sql, String.class, id);
            return Optional.of(fromJson(payload, type));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize OCR workflow payload.", exception);
        }
    }

    private <T> T fromJson(String value, Class<T> type) {
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize OCR workflow payload.", exception);
        }
    }

    private List<OcrExtractedFieldResponse> fromJsonList(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(value, new TypeReference<>() {
            });
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize OCR fields payload.", exception);
        }
    }
}
