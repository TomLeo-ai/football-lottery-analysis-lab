package org.footballlab.ocr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
        "spring.datasource.url=jdbc:h2:mem:ocr_payload_privacy_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class OcrPayloadPrivacyTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        TestDatabaseCleaner.clean(jdbcTemplate);
    }

    @Test
    void persistsMinimizedCandidatePayloadWithoutRawTextFileNameOrImage() throws Exception {
        String workflowId = createWorkflow();
        MvcResult parseResult = mockMvc.perform(post("/api/ocr/workflows/{workflowId}/ocr-candidates", workflowId)
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
                                      "scope": "MATCH",
                                      "fieldName": "homeTeam",
                                      "value": "Northport United",
                                      "confidence": 0.96,
                                      "boundingBox": {"x": 10, "y": 20, "width": 100, "height": 30}
                                    },
                                    {
                                      "fieldId": "field-002",
                                      "scope": "MARKET",
                                      "fieldName": "odds",
                                      "value": "2.05",
                                      "matchRef": "field-001",
                                      "confidence": 0.94,
                                      "boundingBox": {"x": 10, "y": 60, "width": 80, "height": 30}
                                    }
                                  ]
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        String ocrTaskId = JsonFieldExtractor.extractString(
                parseResult.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "ocrTaskId");

        String rawText = jdbcTemplate.queryForObject(
                "select raw_text from ocr_task where ocr_task_id = ?",
                String.class,
                ocrTaskId);
        String payload = jdbcTemplate.queryForObject(
                "select payload_json from ocr_task where ocr_task_id = ?",
                String.class,
                ocrTaskId);

        assertThat(rawText).isNull();
        assertThat(payload)
                .contains("OCR_CANDIDATE_V2")
                .contains("Northport United")
                .doesNotContain("rawText")
                .doesNotContain("fileName")
                .doesNotContain("image")
                .doesNotContain("SECRET");
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
