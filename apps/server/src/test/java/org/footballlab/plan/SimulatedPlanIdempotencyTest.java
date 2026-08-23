package org.footballlab.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.analysis.repository.AnalysisReportRepository;
import org.footballlab.plan.persistence.SimulatedPlanV2Record;
import org.footballlab.plan.repository.SimulatedPlanRepository;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.domain.WorkflowOperationRecord;
import org.footballlab.workflow.domain.WorkflowStage;
import org.footballlab.workflow.repository.WorkflowOperationRepository;
import org.footballlab.workflow.repository.WorkflowRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties =
        "spring.datasource.url=jdbc:h2:mem:plan_idempotency_tests;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000")
@AutoConfigureMockMvc
class SimulatedPlanIdempotencyTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AnalysisReportRepository analysisReportRepository;

    @SpyBean
    private SimulatedPlanRepository simulatedPlanRepository;

    @SpyBean
    private WorkflowRepository workflowRepository;

    @SpyBean
    private WorkflowOperationRepository workflowOperationRepository;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.update("delete from review_record");
        jdbcTemplate.update("delete from simulated_plan_item");
        jdbcTemplate.update("delete from simulated_plan");
        jdbcTemplate.update("delete from workflow_operation");
        jdbcTemplate.update("delete from analysis_report");
        jdbcTemplate.update("delete from ocr_confirmed_snapshot");
        jdbcTemplate.update("delete from ocr_task");
        jdbcTemplate.update("delete from screenshot_task");
        jdbcTemplate.update("delete from ocr_workflow");
        reset(simulatedPlanRepository, workflowRepository, workflowOperationRepository);
    }

    @Test
    void replaysOriginalStatusesAndRejectsKeyReuseAcrossBodyOrOperation() throws Exception {
        AuthoritativePlanTestFixture.Fixture firstFixture = fixture();
        String createKey = key();
        MvcResult firstCreate = create(firstFixture.reportId(), createKey, 201);
        String planId = data(firstCreate).path("planId").asText();
        MvcResult replayCreate = create(firstFixture.reportId(), createKey, 201);
        assertThat(data(replayCreate).path("planId").asText()).isEqualTo(planId);
        assertThat(planCount(firstFixture.workflowId())).isEqualTo(1);
        assertThat(itemCount(planId)).isEqualTo(1);

        AuthoritativePlanTestFixture.Fixture secondFixture = fixture();
        createError(secondFixture.reportId(), createKey, 409, "IDEMPOTENCY_KEY_REUSED");
        saveError(planId, "note", createKey, 409, "IDEMPOTENCY_KEY_REUSED");

        String saveKey = key();
        MvcResult firstSave = save(planId, "  normalized note  ", saveKey, 200);
        MvcResult replaySave = save(planId, "normalized note", saveKey, 200);
        assertThat(data(firstSave)).isEqualTo(data(replaySave));
    }

    @Test
    void rejectsMissingOrInvalidKeyBeforeReservationAndReturnsCurrentPlanForNewKeys() throws Exception {
        AuthoritativePlanTestFixture.Fixture fixture = fixture();
        createError(fixture.reportId(), null, 400, "INVALID_IDEMPOTENCY_KEY");
        createError(fixture.reportId(), "not-a-uuid", 400, "INVALID_IDEMPOTENCY_KEY");
        assertThat(operationCount()).isZero();

        String planId = data(create(fixture.reportId(), key(), 201)).path("planId").asText();
        mockMvc.perform(post("/api/strategies/simulate")
                        .header("Idempotency-Key", key())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request(fixture.reportId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("PLAN_ALREADY_GENERATED"))
                .andExpect(jsonPath("$.error.recovery.currentPlanId").value(planId));

        save(planId, "saved", key(), 200);
        mockMvc.perform(post("/api/simulated-plans")
                        .header("Idempotency-Key", key())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(saveRequest(planId, "other")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("PLAN_ALREADY_SAVED"))
                .andExpect(jsonPath("$.error.recovery.currentPlanId").value(planId));
    }

    @Test
    void twoDifferentKeysCreateOnlyOnePlanAndLoserIsOperationInProgress() throws Exception {
        AuthoritativePlanTestFixture.Fixture fixture = fixture();
        CountDownLatch insertStarted = new CountDownLatch(1);
        CountDownLatch releaseInsert = new CountDownLatch(1);
        CountDownLatch competingClaimStarted = new CountDownLatch(1);
        AtomicInteger claimCount = new AtomicInteger();
        doAnswer(invocation -> {
            if (claimCount.incrementAndGet() == 2) {
                competingClaimStarted.countDown();
            }
            return invocation.callRealMethod();
        }).when(workflowRepository).claimActiveOperation(
                anyString(), anyLong(), any(WorkflowStage.class), any(WorkflowOperationType.class),
                anyString(), anyString());
        doAnswer(invocation -> {
            insertStarted.countDown();
            if (!releaseInsert.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting to release plan insert.");
            }
            return invocation.callRealMethod();
        }).when(simulatedPlanRepository).insertGeneratedPlan(any(SimulatedPlanV2Record.class));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<MvcResult> first = executor.submit(() -> rawCreate(fixture.reportId(), key()));
            assertThat(insertStarted.await(3, TimeUnit.SECONDS)).isTrue();
            Future<MvcResult> second = executor.submit(() -> rawCreate(fixture.reportId(), key()));
            assertThat(competingClaimStarted.await(3, TimeUnit.SECONDS)).isTrue();
            releaseInsert.countDown();

            MvcResult firstResult = first.get(6, TimeUnit.SECONDS);
            MvcResult secondResult = second.get(6, TimeUnit.SECONDS);
            assertThat(firstResult.getResponse().getStatus()).isEqualTo(201);
            assertThat(secondResult.getResponse().getStatus()).isEqualTo(409);
            assertThat(root(secondResult).path("error").path("errorCode").asText())
                    .isEqualTo("OPERATION_IN_PROGRESS");
            assertThat(planCount(fixture.workflowId())).isEqualTo(1);
        } finally {
            releaseInsert.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void sameKeyConcurrentReservationReplaysSucceededPlanInsteadOfRecordingFailure() throws Exception {
        AuthoritativePlanTestFixture.Fixture fixture = fixture();
        String idempotencyKey = key();
        CountDownLatch firstPlanInsertStarted = new CountDownLatch(1);
        CountDownLatch releaseFirstPlanInsert = new CountDownLatch(1);
        CountDownLatch secondReservationInsertAttempted = new CountDownLatch(1);
        AtomicInteger reservationInsertCount = new AtomicInteger();
        doAnswer(invocation -> {
            if (reservationInsertCount.incrementAndGet() == 2) {
                secondReservationInsertAttempted.countDown();
            }
            return invocation.callRealMethod();
        }).when(workflowOperationRepository).createInProgress(any(WorkflowOperationRecord.class));
        doAnswer(invocation -> {
            firstPlanInsertStarted.countDown();
            if (!releaseFirstPlanInsert.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting to release first plan insert.");
            }
            return invocation.callRealMethod();
        }).when(simulatedPlanRepository).insertGeneratedPlan(any(SimulatedPlanV2Record.class));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<MvcResult> first = executor.submit(
                    () -> rawCreate(fixture.reportId(), idempotencyKey));
            assertThat(firstPlanInsertStarted.await(3, TimeUnit.SECONDS)).isTrue();
            Future<MvcResult> concurrentReplay = executor.submit(
                    () -> rawCreate(fixture.reportId(), idempotencyKey));
            assertThat(secondReservationInsertAttempted.await(3, TimeUnit.SECONDS)).isTrue();
            releaseFirstPlanInsert.countDown();

            MvcResult firstResult = first.get(6, TimeUnit.SECONDS);
            MvcResult replayResult = concurrentReplay.get(6, TimeUnit.SECONDS);
            assertThat(firstResult.getResponse().getStatus()).isEqualTo(201);
            assertThat(replayResult.getResponse().getStatus()).isEqualTo(201);
            assertThat(data(replayResult).path("planId").asText())
                    .isEqualTo(data(firstResult).path("planId").asText());
            assertThat(jdbcTemplate.queryForObject(
                    "select count(*) from workflow_operation where idempotency_key = ?",
                    Integer.class,
                    idempotencyKey)).isEqualTo(1);
            assertThat(jdbcTemplate.queryForObject(
                    "select operation_status from workflow_operation where idempotency_key = ?",
                    String.class,
                    idempotencyKey)).isEqualTo("SUCCEEDED");
            assertThat(planCount(fixture.workflowId())).isEqualTo(1);
            assertThat(itemCount(data(firstResult).path("planId").asText())).isEqualTo(1);
        } finally {
            releaseFirstPlanInsert.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void rollsBackPlanAndReplaysStablePersistenceFailure() throws Exception {
        AuthoritativePlanTestFixture.Fixture fixture = fixture();
        String idempotencyKey = key();
        doThrow(new IllegalStateException("injected plan workflow CAS failure"))
                .when(workflowRepository)
                .transitionPlanGenerationClaimed(
                        anyString(), anyLong(), any(WorkflowStage.class), any(WorkflowOperationType.class),
                        anyString(), anyString(), anyString(), anyString());

        createError(fixture.reportId(), idempotencyKey, 500, "PLAN_PERSISTENCE_FAILED");
        reset(workflowRepository);
        createError(fixture.reportId(), idempotencyKey, 500, "PLAN_PERSISTENCE_FAILED");

        assertThat(planCount(fixture.workflowId())).isZero();
        assertThat(stage(fixture.workflowId())).isEqualTo("ANALYSIS_GENERATED");
        assertThat(jdbcTemplate.queryForObject(
                "select operation_status from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo("FAILED");
        assertThat(jdbcTemplate.queryForObject(
                "select error_code from workflow_operation where idempotency_key = ?",
                String.class,
                idempotencyKey)).isEqualTo("PLAN_PERSISTENCE_FAILED");
    }

    private AuthoritativePlanTestFixture.Fixture fixture() throws Exception {
        return AuthoritativePlanTestFixture.insert(jdbcTemplate, objectMapper, analysisReportRepository);
    }

    private MvcResult create(String reportId, String idempotencyKey, int status) throws Exception {
        return mockMvc.perform(post("/api/strategies/simulate")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request(reportId)))
                .andExpect(status().is(status))
                .andReturn();
    }

    private MvcResult rawCreate(String reportId, String idempotencyKey) throws Exception {
        return mockMvc.perform(post("/api/strategies/simulate")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request(reportId)))
                .andReturn();
    }

    private void createError(String reportId, String idempotencyKey, int status, String errorCode) throws Exception {
        var builder = post("/api/strategies/simulate").contentType(MediaType.APPLICATION_JSON).content(request(reportId));
        if (idempotencyKey != null) {
            builder.header("Idempotency-Key", idempotencyKey);
        }
        mockMvc.perform(builder)
                .andExpect(status().is(status))
                .andExpect(jsonPath("$.error.errorCode").value(errorCode));
    }

    private MvcResult save(String planId, String note, String idempotencyKey, int status) throws Exception {
        return mockMvc.perform(post("/api/simulated-plans")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(saveRequest(planId, note)))
                .andExpect(status().is(status))
                .andReturn();
    }

    private void saveError(String planId, String note, String key, int status, String errorCode) throws Exception {
        mockMvc.perform(post("/api/simulated-plans")
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(saveRequest(planId, note)))
                .andExpect(status().is(status))
                .andExpect(jsonPath("$.error.errorCode").value(errorCode));
    }

    private String request(String reportId) {
        return "{\"reportId\":\"%s\"}".formatted(reportId);
    }

    private String saveRequest(String planId, String note) throws Exception {
        return objectMapper.writeValueAsString(java.util.Map.of("generatedPlanId", planId, "operatorNote", note));
    }

    private JsonNode root(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode data(MvcResult result) throws Exception {
        return root(result).path("data");
    }

    private String key() {
        return UUID.randomUUID().toString();
    }

    private int operationCount() {
        return jdbcTemplate.queryForObject("select count(*) from workflow_operation", Integer.class);
    }

    private int planCount(String workflowId) {
        return jdbcTemplate.queryForObject(
                "select count(*) from simulated_plan where workflow_id = ?", Integer.class, workflowId);
    }

    private int itemCount(String planId) {
        return jdbcTemplate.queryForObject(
                "select count(*) from simulated_plan_item where plan_id = ?", Integer.class, planId);
    }

    private String stage(String workflowId) {
        return jdbcTemplate.queryForObject(
                "select current_stage from ocr_workflow where workflow_id = ?", String.class, workflowId);
    }
}
