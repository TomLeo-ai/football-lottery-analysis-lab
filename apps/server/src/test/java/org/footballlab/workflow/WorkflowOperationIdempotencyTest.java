package org.footballlab.workflow;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.footballlab.common.error.ApiException;
import org.footballlab.workflow.domain.WorkflowOperationStatus;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.domain.WorkflowRecord;
import org.footballlab.workflow.domain.WorkflowStage;
import org.footballlab.workflow.repository.WorkflowRepository;
import org.footballlab.workflow.service.RequestHashService;
import org.footballlab.workflow.service.WorkflowOperationService;
import org.footballlab.workflow.service.WorkflowOperationService.ReservationStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:workflow_operation_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
class WorkflowOperationIdempotencyTest {

    private static final String NOW = "2026-08-22T03:00:00Z";

    @Autowired
    private WorkflowRepository workflowRepository;

    @Autowired
    private WorkflowOperationService operationService;

    @Autowired
    private RequestHashService requestHashService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("delete from workflow_operation");
        jdbcTemplate.update("delete from ocr_workflow");
        workflowRepository.create(new WorkflowRecord(
                "workflow-operation-001",
                WorkflowStage.WAITING_LOCAL_OCR,
                0L,
                null,
                null,
                null,
                null,
                null,
                null,
                NOW,
                NOW));
    }

    @Test
    void reservesInProgressOperationAndReplaysOriginalSuccess() {
        String requestHash = requestHash("workflow-operation-001", 0L);

        var first = operationService.reserve(
                "idem-create-001",
                "workflow-operation-001",
                WorkflowOperationType.CREATE_WORKFLOW,
                requestHash,
                NOW);
        assertThat(first.status()).isEqualTo(ReservationStatus.RESERVED);

        var inProgress = operationService.reserve(
                "idem-create-001",
                "workflow-operation-001",
                WorkflowOperationType.CREATE_WORKFLOW,
                requestHash,
                NOW);
        assertThat(inProgress.status()).isEqualTo(ReservationStatus.IN_PROGRESS);

        assertThat(operationService.completeSuccess(
                "idem-create-001",
                "WORKFLOW",
                "workflow-operation-001",
                201,
                "2026-08-22T03:01:00Z"))
                .isTrue();

        var replay = operationService.reserve(
                "idem-create-001",
                "workflow-operation-001",
                WorkflowOperationType.CREATE_WORKFLOW,
                requestHash,
                NOW);
        assertThat(replay.status()).isEqualTo(ReservationStatus.REPLAY);
        assertThat(replay.operation().operationStatus()).isEqualTo(WorkflowOperationStatus.SUCCEEDED);
        assertThat(replay.operation().httpStatus()).isEqualTo(201);
        assertThat(replay.operation().resultId()).isEqualTo("workflow-operation-001");
    }

    @Test
    void rejectsReusedIdempotencyKeyForDifferentRequestOrOperation() {
        String requestHash = requestHash("workflow-operation-001", 0L);
        operationService.reserve(
                "idem-conflict-001",
                "workflow-operation-001",
                WorkflowOperationType.SAVE_DRAFT,
                requestHash,
                NOW);

        assertThatThrownBy(() -> operationService.reserve(
                "idem-conflict-001",
                "workflow-operation-001",
                WorkflowOperationType.SAVE_DRAFT,
                requestHash("workflow-operation-001", 1L),
                NOW))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Idempotency key was already used");

        assertThatThrownBy(() -> operationService.reserve(
                "idem-conflict-001",
                "workflow-operation-001",
                WorkflowOperationType.CONFIRM_SNAPSHOT,
                requestHash,
                NOW))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void replaysStableFailedOperationOutcome() {
        String requestHash = requestHash("workflow-operation-001", 0L);
        operationService.reserve(
                "idem-failed-001",
                "workflow-operation-001",
                WorkflowOperationType.CONFIRM_SNAPSHOT,
                requestHash,
                NOW);

        assertThat(operationService.completeFailure(
                "idem-failed-001",
                "DRAFT_REVISION_CONFLICT",
                409,
                "2026-08-22T03:02:00Z"))
                .isTrue();

        var replay = operationService.reserve(
                "idem-failed-001",
                "workflow-operation-001",
                WorkflowOperationType.CONFIRM_SNAPSHOT,
                requestHash,
                NOW);
        assertThat(replay.status()).isEqualTo(ReservationStatus.REPLAY);
        assertThat(replay.operation().operationStatus()).isEqualTo(WorkflowOperationStatus.FAILED);
        assertThat(replay.operation().errorCode()).isEqualTo("DRAFT_REVISION_CONFLICT");
        assertThat(replay.operation().httpStatus()).isEqualTo(409);
    }

    @Test
    void canonicalRequestHashIgnoresOrderAndVolatileFields() {
        UUID matchUuid = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
        Map<String, Object> left = new LinkedHashMap<>();
        left.put("workflowId", "workflow-operation-001");
        left.put("expectedVersion", 1L);
        left.put("traceId", "trace-a");
        left.put("request", Map.of(
                "odds", new BigDecimal("2.3400"),
                "matchUuid", matchUuid,
                "markets", List.of(Map.of("selection", "home"))));

        Map<String, Object> right = new LinkedHashMap<>();
        right.put("request", Map.of(
                "markets", List.of(Map.of("selection", "home")),
                "matchUuid", matchUuid.toString().toUpperCase(),
                "odds", new BigDecimal("2.34")));
        right.put("timestamp", "2026-08-22T04:00:00Z");
        right.put("expectedVersion", 1L);
        right.put("workflowId", "workflow-operation-001");

        assertThat(requestHashService.hash(WorkflowOperationType.SAVE_DRAFT, "post", "/api/ocr/review-drafts/ocr-1", left))
                .isEqualTo(requestHashService.hash(
                        WorkflowOperationType.SAVE_DRAFT,
                        "POST",
                        "/api/ocr/review-drafts/ocr-1",
                        right));
    }

    private String requestHash(String workflowId, long expectedVersion) {
        return requestHashService.hash(
                WorkflowOperationType.CREATE_WORKFLOW,
                "POST",
                "/api/workflows",
                Map.of("workflowId", workflowId, "expectedVersion", expectedVersion));
    }
}
