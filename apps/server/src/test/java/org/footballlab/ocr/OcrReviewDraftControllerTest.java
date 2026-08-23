package org.footballlab.ocr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
        "spring.datasource.url=jdbc:h2:mem:ocr_review_draft_controller_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class OcrReviewDraftControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        TestDatabaseCleaner.clean(jdbcTemplate);
    }

    @Test
    void savesRevisionedDraftAndReplaysSameIdempotencyKey() throws Exception {
        String ocrTaskId = createWorkflowAndManualBlankDraft();
        String saveKey = UUID.randomUUID().toString();

        mockMvc.perform(put("/api/ocr/review-drafts/{ocrTaskId}", ocrTaskId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, saveKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validDraftBody(0, "Northport United")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.revision").value(1))
                .andExpect(jsonPath("$.data.matches[0].homeTeam").value("Northport United"))
                .andExpect(jsonPath("$.data.markets[0].odds").value(2.05));

        assertThat(jdbcTemplate.queryForObject(
                "select revision from ocr_review_draft where ocr_task_id = ?",
                Long.class,
                ocrTaskId))
                .isEqualTo(1L);

        mockMvc.perform(put("/api/ocr/review-drafts/{ocrTaskId}", ocrTaskId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, saveKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validDraftBody(0, "Northport United")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.revision").value(1));
    }

    @Test
    void rejectsReusedSaveKeyWithDifferentPayloadAndStaleRevision() throws Exception {
        String ocrTaskId = createWorkflowAndManualBlankDraft();
        String saveKey = UUID.randomUUID().toString();

        mockMvc.perform(put("/api/ocr/review-drafts/{ocrTaskId}", ocrTaskId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, saveKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validDraftBody(0, "Northport United")))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/ocr/review-drafts/{ocrTaskId}", ocrTaskId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, saveKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validDraftBody(1, "Changed FC")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("IDEMPOTENCY_KEY_REUSED"));

        mockMvc.perform(put("/api/ocr/review-drafts/{ocrTaskId}", ocrTaskId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validDraftBody(0, "Northport United")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("DRAFT_REVISION_CONFLICT"));
    }

    @Test
    void rejectsInvalidDraftMarketShape() throws Exception {
        String ocrTaskId = createWorkflowAndManualBlankDraft();

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
                                      "matchId": "missing-match",
                                      "playType": "WIN_DRAW_LOSS",
                                      "selection": "HOME_WIN",
                                      "odds": 2.12345
                                    }
                                  ]
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("VALIDATION_FAILED"));
    }

    @Test
    void restoresSavedDraftInOriginalOrderAndFailsClosedWhenMissing() throws Exception {
        String ocrTaskId = createWorkflowAndManualBlankDraft();

        mockMvc.perform(put("/api/ocr/review-drafts/{ocrTaskId}", ocrTaskId)
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(orderedDraftBody()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.revision").value(1));

        mockMvc.perform(get("/api/ocr/review-drafts/{ocrTaskId}", ocrTaskId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ocrTaskId").value(ocrTaskId))
                .andExpect(jsonPath("$.data.revision").value(1))
                .andExpect(jsonPath("$.data.matches[0].homeTeam").value("First Home"))
                .andExpect(jsonPath("$.data.matches[1].homeTeam").value("Second Home"))
                .andExpect(jsonPath("$.data.markets[0].matchId").value("match-first"))
                .andExpect(jsonPath("$.data.markets[1].matchId").value("match-second"));

        mockMvc.perform(get("/api/ocr/review-drafts/{ocrTaskId}", "missing-ocr-task"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.errorCode").value("DRAFT_NOT_FOUND"));
    }

    private String createWorkflowAndManualBlankDraft() throws Exception {
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
        return JsonFieldExtractor.extractString(
                parseResult.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "ocrTaskId");
    }

    private String validDraftBody(long expectedRevision, String homeTeam) {
        return """
                {
                  "expectedRevision": %d,
                  "riskPreference": "BALANCED",
                  "budgetAmount": 30.00,
                  "currency": "CNY",
                  "matches": [
                    {
                      "matchId": "match-001",
                      "matchDate": "2026-08-22",
                      "league": "Fictional League",
                      "homeTeam": "%s",
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
                """.formatted(expectedRevision, homeTeam);
    }

    private String orderedDraftBody() {
        return """
                {
                  "expectedRevision": 0,
                  "riskPreference": "BALANCED",
                  "budgetAmount": 30.00,
                  "currency": "CNY",
                  "matches": [
                    {
                      "matchId": "match-first",
                      "matchDate": "2026-08-22",
                      "league": "Fictional League",
                      "homeTeam": "First Home",
                      "awayTeam": "First Away",
                      "kickoffTime": "2026-08-22T12:00:00Z"
                    },
                    {
                      "matchId": "match-second",
                      "matchDate": "2026-08-23",
                      "league": "Fictional League",
                      "homeTeam": "Second Home",
                      "awayTeam": "Second Away",
                      "kickoffTime": "2026-08-23T12:00:00Z"
                    }
                  ],
                  "markets": [
                    {
                      "marketId": "market-first",
                      "matchId": "match-first",
                      "playType": "WIN_DRAW_LOSS",
                      "selection": "HOME_WIN",
                      "odds": 2.05
                    },
                    {
                      "marketId": "market-second",
                      "matchId": "match-second",
                      "playType": "WIN_DRAW_LOSS",
                      "selection": "DRAW",
                      "odds": 3.40
                    }
                  ]
                }
                """;
    }
}
