package org.footballlab.ocr;

import static org.assertj.core.api.Assertions.assertThat;
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
        "spring.datasource.url=jdbc:h2:mem:ocr_candidate_validation_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class OcrCandidateValidationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        TestDatabaseCleaner.clean(jdbcTemplate);
    }

    @Test
    void acceptsManualBlankCandidateAndCreatesRevisionZeroDraft() throws Exception {
        String workflowId = createWorkflow();
        String parseKey = UUID.randomUUID().toString();

        MvcResult parseResult = mockMvc.perform(post("/api/ocr/workflows/{workflowId}/ocr-candidates", workflowId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, parseKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "expectedVersion": 0,
                                  "entryMode": "MANUAL_BLANK",
                                  "replaceDraft": false,
                                  "languages": [],
                                  "processedWidth": 1200,
                                  "processedHeight": 800,
                                  "candidateFields": []
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andExpect(jsonPath("$.data.status").value("WAITING_USER_CONFIRMATION"))
                .andExpect(jsonPath("$.data.analysisAllowed").value(false))
                .andReturn();

        String ocrTaskId = JsonFieldExtractor.extractString(
                parseResult.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "ocrTaskId");

        assertThat(jdbcTemplate.queryForObject(
                "select raw_text from ocr_task where ocr_task_id = ?",
                String.class,
                ocrTaskId))
                .isNull();
        assertThat(jdbcTemplate.queryForObject(
                "select revision from ocr_review_draft where ocr_task_id = ? and workflow_id = ?",
                Long.class,
                ocrTaskId,
                workflowId))
                .isZero();

        mockMvc.perform(post("/api/ocr/workflows/{workflowId}/ocr-candidates", workflowId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, parseKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "expectedVersion": 0,
                                  "entryMode": "MANUAL_BLANK",
                                  "replaceDraft": false,
                                  "languages": [],
                                  "processedWidth": 1200,
                                  "processedHeight": 800,
                                  "candidateFields": []
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.ocrTaskId").value(ocrTaskId));
    }

    @Test
    void rejectsUnknownSensitiveCandidatePropertiesWithoutEchoingValues() throws Exception {
        String workflowId = createWorkflow();

        MvcResult result = mockMvc.perform(post("/api/ocr/workflows/{workflowId}/ocr-candidates", workflowId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "expectedVersion": 0,
                                  "entryMode": "OCR",
                                  "replaceDraft": false,
                                  "ocrEngine": "TESSERACT_BROWSER",
                                  "ocrEngineVersion": "5.x",
                                  "languages": ["eng"],
                                  "processedWidth": 1200,
                                  "processedHeight": 800,
                                  "candidateFields": [],
                                  "rawText": "SECRET_RAW_TEXT_SENTINEL"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("UNKNOWN_FIELD"))
                .andExpect(jsonPath("$.error.fieldErrors[0].fieldPath").value("rawText"))
                .andReturn();

        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain("SECRET_RAW_TEXT_SENTINEL");
    }

    @Test
    void rejectsInvalidCandidateFieldShape() throws Exception {
        String workflowId = createWorkflow();

        mockMvc.perform(post("/api/ocr/workflows/{workflowId}/ocr-candidates", workflowId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "expectedVersion": 0,
                                  "entryMode": "OCR",
                                  "replaceDraft": false,
                                  "ocrEngine": "TESSERACT_BROWSER",
                                  "ocrEngineVersion": "5.x",
                                  "languages": ["eng"],
                                  "processedWidth": 1200,
                                  "processedHeight": 800,
                                  "candidateFields": [
                                    {
                                      "fieldId": "field-001",
                                      "scope": "MARKET",
                                      "fieldName": "rawText",
                                      "value": "2.05",
                                      "confidence": 1.5
                                    }
                                  ]
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("VALIDATION_FAILED"));
    }

    private String createWorkflow() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/ocr/workflows")
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sourceDeclaration": "FICTIONAL_SAMPLE",
                                  "sourcePolicyVersion": "SOURCE_POLICY_V2",
                                  "contentType": "image/png",
                                  "byteSize": 1234,
                                  "width": 1200,
                                  "height": 800
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        return JsonFieldExtractor.extractString(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "workflowId");
    }
}
