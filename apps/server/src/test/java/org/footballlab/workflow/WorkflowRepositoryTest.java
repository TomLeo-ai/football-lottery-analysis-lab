package org.footballlab.workflow;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.footballlab.common.error.ApiException;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.domain.WorkflowRecord;
import org.footballlab.workflow.domain.WorkflowStage;
import org.footballlab.workflow.repository.WorkflowRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:workflow_repository_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
class WorkflowRepositoryTest {

    private static final String CREATED_AT = "2026-08-22T02:00:00Z";
    private static final String UPDATED_AT = "2026-08-22T02:01:00Z";

    @Autowired
    private WorkflowRepository workflowRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("delete from workflow_operation");
        jdbcTemplate.update("delete from ocr_workflow");
    }

    @Test
    void createsWorkflowAndTransitionsWithSingleStatementCas() {
        workflowRepository.create(newWorkflow("workflow-cas-001"));

        boolean transitioned = workflowRepository.transition(
                "workflow-cas-001",
                0L,
                WorkflowStage.WAITING_LOCAL_OCR,
                WorkflowStage.WAITING_USER_CONFIRMATION,
                "ocr-task-001",
                null,
                null,
                null,
                UPDATED_AT);

        assertThat(transitioned).isTrue();
        WorkflowRecord updated = workflowRepository.findById("workflow-cas-001").orElseThrow();
        assertThat(updated.currentStage()).isEqualTo(WorkflowStage.WAITING_USER_CONFIRMATION);
        assertThat(updated.version()).isEqualTo(1L);
        assertThat(updated.currentOcrTaskId()).isEqualTo("ocr-task-001");

        boolean staleUpdate = workflowRepository.transition(
                "workflow-cas-001",
                0L,
                WorkflowStage.WAITING_LOCAL_OCR,
                WorkflowStage.WAITING_USER_CONFIRMATION,
                "ocr-task-001",
                null,
                null,
                null,
                UPDATED_AT);
        assertThat(staleUpdate).isFalse();
    }

    @Test
    void rejectsIllegalStageTransitionBeforeSqlUpdate() {
        workflowRepository.create(newWorkflow("workflow-illegal-001"));

        assertThatThrownBy(() -> workflowRepository.transition(
                "workflow-illegal-001",
                0L,
                WorkflowStage.WAITING_LOCAL_OCR,
                WorkflowStage.CONFIRMED,
                "ocr-task-001",
                "snapshot-001",
                null,
                null,
                UPDATED_AT))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Workflow stage transition is not allowed.");

        WorkflowRecord unchanged = workflowRepository.findById("workflow-illegal-001").orElseThrow();
        assertThat(unchanged.currentStage()).isEqualTo(WorkflowStage.WAITING_LOCAL_OCR);
        assertThat(unchanged.version()).isZero();
    }

    @Test
    void claimsAndClearsActiveOperationByOperationKey() {
        workflowRepository.create(newWorkflow("workflow-active-001"));

        assertThat(workflowRepository.claimActiveOperation(
                "workflow-active-001",
                0L,
                WorkflowStage.WAITING_LOCAL_OCR,
                WorkflowOperationType.PARSE_OCR,
                "idem-parse-001",
                UPDATED_AT))
                .isTrue();

        WorkflowRecord claimed = workflowRepository.findById("workflow-active-001").orElseThrow();
        assertThat(claimed.version()).isEqualTo(1L);
        assertThat(claimed.activeOperationType()).isEqualTo(WorkflowOperationType.PARSE_OCR);
        assertThat(claimed.activeOperationKey()).isEqualTo("idem-parse-001");

        assertThat(workflowRepository.claimActiveOperation(
                "workflow-active-001",
                1L,
                WorkflowStage.WAITING_LOCAL_OCR,
                WorkflowOperationType.SAVE_DRAFT,
                "idem-save-001",
                UPDATED_AT))
                .isFalse();
        assertThat(workflowRepository.clearActiveOperation(
                "workflow-active-001",
                WorkflowOperationType.PARSE_OCR,
                "wrong-key",
                UPDATED_AT))
                .isFalse();
        assertThat(workflowRepository.clearActiveOperation(
                "workflow-active-001",
                WorkflowOperationType.PARSE_OCR,
                "idem-parse-001",
                UPDATED_AT))
                .isTrue();

        WorkflowRecord cleared = workflowRepository.findById("workflow-active-001").orElseThrow();
        assertThat(cleared.version()).isEqualTo(2L);
        assertThat(cleared.activeOperationType()).isNull();
        assertThat(cleared.activeOperationKey()).isNull();
    }

    private WorkflowRecord newWorkflow(String workflowId) {
        return new WorkflowRecord(
                workflowId,
                WorkflowStage.WAITING_LOCAL_OCR,
                0L,
                null,
                null,
                null,
                null,
                null,
                null,
                CREATED_AT,
                CREATED_AT);
    }
}
