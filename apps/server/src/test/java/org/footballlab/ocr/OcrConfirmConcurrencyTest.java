package org.footballlab.ocr;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
        "spring.datasource.url=jdbc:h2:mem:ocr_confirm_concurrency_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class OcrConfirmConcurrencyTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        TestDatabaseCleaner.clean(jdbcTemplate);
    }

    @Test
    void rejectsStaleRevisionAndDifferentKeyDuplicateConfirmation() throws Exception {
        Fixture fixture = createSavedDraft();

        mockMvc.perform(post("/api/ocr/review-drafts/{ocrTaskId}/confirm", fixture.ocrTaskId())
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision": 0}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("DRAFT_REVISION_CONFLICT"));

        mockMvc.perform(post("/api/ocr/review-drafts/{ocrTaskId}/confirm", fixture.ocrTaskId())
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision": 1}
                                """))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/ocr/review-drafts/{ocrTaskId}/confirm", fixture.ocrTaskId())
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision": 1}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("WORKFLOW_ALREADY_CONFIRMED"));
    }

    private Fixture createSavedDraft() throws Exception {
        MvcResult workflowResult = mockMvc.perform(post("/api/ocr/workflows")
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
        String workflowId = JsonFieldExtractor.extractString(
                workflowResult.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "workflowId");
        MvcResult parseResult = mockMvc.perform(post("/api/ocr/workflows/{workflowId}/ocr-candidates", workflowId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
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
                .andReturn();
        String ocrTaskId = JsonFieldExtractor.extractString(
                parseResult.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "ocrTaskId");
        mockMvc.perform(put("/api/ocr/review-drafts/{ocrTaskId}", ocrTaskId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "expectedRevision": 0,
                                  "riskPreference": "BALANCED",
                                  "budgetAmount": 30.00,
                                  "currency": "CNY",
                                  "matches": [
                                    {
                                      "matchId": "match-001",
                                      "matchDate": "2026-08-22",
                                      "league": "Fictional League",
                                      "homeTeam": "Northport United",
                                      "awayTeam": "Lakeside City",
                                      "kickoffTime": "2026-08-22T12:00:00Z"
                                    }
                                  ],
                                  "markets": [
                                    {
                                      "marketId": "market-001",
                                      "matchId": "match-001",
                                      "playType": "WIN_DRAW_LOSS",
                                      "selection": "HOME_WIN",
                                      "odds": 2.05
                                    }
                                  ]
                                }
                                """))
                .andExpect(status().isOk());
        return new Fixture(ocrTaskId);
    }

    private record Fixture(String ocrTaskId) {
    }
}
