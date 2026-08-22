package org.footballlab.ocr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.footballlab.ocr.service.OcrWorkflowTransactionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:recoverable_ocr_workflow_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class OcrWorkflowStateMachineTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("delete from workflow_operation");
        jdbcTemplate.update("delete from ocr_review_draft");
        jdbcTemplate.update("delete from simulated_plan_item");
        jdbcTemplate.update("delete from review_record");
        jdbcTemplate.update("delete from simulated_plan");
        jdbcTemplate.update("delete from analysis_report");
        jdbcTemplate.update("delete from ocr_confirmed_snapshot");
        jdbcTemplate.update("delete from ocr_task");
        jdbcTemplate.update("delete from screenshot_task");
        jdbcTemplate.update("delete from ocr_workflow");
    }

    @Test
    void createsReadsAndReplaysRecoverableWorkflow() throws Exception {
        String idempotencyKey = UUID.randomUUID().toString();
        String requestBody = createWorkflowBody(1234, 1200, 800);

        MvcResult first = mockMvc.perform(post("/api/ocr/workflows")
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andExpect(jsonPath("$.data.currentStage").value("WAITING_LOCAL_OCR"))
                .andExpect(jsonPath("$.data.version").value(0))
                .andExpect(jsonPath("$.data.workflowId").isNotEmpty())
                .andExpect(jsonPath("$.data.screenshotTaskId").isNotEmpty())
                .andReturn();

        String firstBody = first.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String workflowId = JsonFieldExtractor.extractString(firstBody, "workflowId");
        String screenshotTaskId = JsonFieldExtractor.extractString(firstBody, "screenshotTaskId");
        assertThat(workflowId).startsWith("workflow-");
        assertThat(screenshotTaskId).startsWith("screenshot-");

        mockMvc.perform(get("/api/ocr/workflows/{workflowId}", workflowId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.workflowId").value(workflowId))
                .andExpect(jsonPath("$.data.screenshotTaskId").value(screenshotTaskId))
                .andExpect(jsonPath("$.data.currentStage").value("WAITING_LOCAL_OCR"));

        mockMvc.perform(post("/api/ocr/workflows")
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.workflowId").value(workflowId))
                .andExpect(jsonPath("$.data.screenshotTaskId").value(screenshotTaskId));

        Integer operationWorkflowRows = jdbcTemplate.queryForObject(
                "select count(*) from workflow_operation where idempotency_key = ? and workflow_id = ? and http_status = 201",
                Integer.class,
                idempotencyKey,
                workflowId);
        assertThat(operationWorkflowRows).isEqualTo(1);
    }

    @Test
    void rejectsReusedCreateKeyWithDifferentBodyAndStrictUnknownFields() throws Exception {
        String idempotencyKey = UUID.randomUUID().toString();
        mockMvc.perform(post("/api/ocr/workflows")
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createWorkflowBody(1234, 1200, 800)))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/ocr/workflows")
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createWorkflowBody(1235, 1200, 800)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("IDEMPOTENCY_KEY_REUSED"));

        MvcResult unknownField = mockMvc.perform(post("/api/ocr/workflows")
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sourceDeclaration": "FICTIONAL_SAMPLE",
                                  "sourcePolicyVersion": "SOURCE_POLICY_V2",
                                  "contentType": "image/png",
                                  "byteSize": 1234,
                                  "width": 1200,
                                  "height": 800,
                                  "fileName": "SECRET_FILE_NAME.png"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("UNKNOWN_FIELD"))
                .andExpect(jsonPath("$.error.fieldErrors[0].fieldPath").value("fileName"))
                .andReturn();

        assertThat(unknownField.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain("SECRET_FILE_NAME");
    }

    @Test
    void abandonsPreConfirmationWorkflowIdempotently() throws Exception {
        String createKey = UUID.randomUUID().toString();
        MvcResult createResult = mockMvc.perform(post("/api/ocr/workflows")
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, createKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createWorkflowBody(1234, 1200, 800)))
                .andExpect(status().isCreated())
                .andReturn();
        String workflowId = JsonFieldExtractor.extractString(
                createResult.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "workflowId");

        String abandonKey = UUID.randomUUID().toString();
        mockMvc.perform(delete("/api/ocr/workflows/{workflowId}", workflowId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, abandonKey))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/ocr/workflows/{workflowId}", workflowId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, abandonKey))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/ocr/workflows/{workflowId}", workflowId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currentStage").value("ABANDONED"))
                .andExpect(jsonPath("$.data.version").value(1));
    }

    @Test
    void requiresUuidIdempotencyKey() throws Exception {
        mockMvc.perform(post("/api/ocr/workflows")
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, "not-a-uuid")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createWorkflowBody(1234, 1200, 800)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("INVALID_IDEMPOTENCY_KEY"));
    }

    private String createWorkflowBody(long byteSize, int width, int height) {
        return """
                {
                  "sourceDeclaration": "FICTIONAL_SAMPLE",
                  "sourcePolicyVersion": "SOURCE_POLICY_V2",
                  "contentType": "image/png",
                  "byteSize": %d,
                  "width": %d,
                  "height": %d
                }
                """.formatted(byteSize, width, height);
    }

    private static final class JsonFieldExtractor {

        private JsonFieldExtractor() {
        }

        static String extractString(String json, String fieldName) {
            String marker = "\"" + fieldName + "\":\"";
            int start = json.indexOf(marker);
            assertThat(start).isGreaterThanOrEqualTo(0);
            int valueStart = start + marker.length();
            int valueEnd = json.indexOf('"', valueStart);
            assertThat(valueEnd).isGreaterThan(valueStart);
            return json.substring(valueStart, valueEnd);
        }
    }
}
