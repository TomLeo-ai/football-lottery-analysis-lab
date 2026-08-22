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
        "spring.datasource.url=jdbc:h2:mem:ocr_confirm_controller_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class OcrConfirmControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        TestDatabaseCleaner.clean(jdbcTemplate);
    }

    @Test
    void confirmsRevisionedDraftAndReplaysSameIdempotencyKey() throws Exception {
        DraftFixture fixture = createSavedDraft();
        String confirmKey = UUID.randomUUID().toString();

        MvcResult confirmResult = mockMvc.perform(post("/api/ocr/review-drafts/{ocrTaskId}/confirm", fixture.ocrTaskId())
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, confirmKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision": 1}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andExpect(jsonPath("$.data.workflowId").value(fixture.workflowId()))
                .andExpect(jsonPath("$.data.confirmedRevision").value(1))
                .andExpect(jsonPath("$.data.authorityType").value("SERVER_CONFIRMED_V2"))
                .andExpect(jsonPath("$.data.schemaVersion").value("CONFIRMED_SNAPSHOT_V2"))
                .andExpect(jsonPath("$.data.matches[0].homeTeam").value("Northport United"))
                .andExpect(jsonPath("$.data.markets[0].odds").value(2.05))
                .andReturn();

        String body = confirmResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String snapshotId = JsonFieldExtractor.extractString(body, "snapshotId");
        String formalMatchId = JsonFieldExtractor.extractString(body, "matchId");
        assertThat(formalMatchId).isNotEqualTo("match-001");

        mockMvc.perform(post("/api/ocr/review-drafts/{ocrTaskId}/confirm", fixture.ocrTaskId())
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, confirmKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision": 1}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.snapshotId").value(snapshotId));

        mockMvc.perform(get("/api/ocr/snapshots/{snapshotId}", snapshotId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.snapshotId").value(snapshotId))
                .andExpect(jsonPath("$.data.schemaVersion").value("CONFIRMED_SNAPSHOT_V2"));

        mockMvc.perform(get("/api/ocr/workflows/{workflowId}", fixture.workflowId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currentStage").value("CONFIRMED"))
                .andExpect(jsonPath("$.data.confirmedSnapshotId").value(snapshotId));

        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from ocr_review_draft where workflow_id = ?",
                Integer.class,
                fixture.workflowId()))
                .isZero();
        assertThat(jdbcTemplate.queryForObject(
                "select payload_json from ocr_task where ocr_task_id = ?",
                String.class,
                fixture.ocrTaskId()))
                .isNull();
    }

    @Test
    void rejectsIncompleteDraftAndLegacyConfirmEndpoint() throws Exception {
        DraftFixture fixture = createManualBlankDraft();

        mockMvc.perform(post("/api/ocr/review-drafts/{ocrTaskId}/confirm", fixture.ocrTaskId())
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision": 0}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.errorCode").value("DRAFT_NOT_CONFIRMABLE"));

        mockMvc.perform(post("/api/ocr/review/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.error.errorCode").value("LEGACY_CONFIRM_ENDPOINT_REMOVED"));
    }

    @Test
    void rejectsAuthorityFieldsInConfirmBody() throws Exception {
        DraftFixture fixture = createSavedDraft();

        mockMvc.perform(post("/api/ocr/review-drafts/{ocrTaskId}/confirm", fixture.ocrTaskId())
                        .header(OcrWorkflowTransactionService.IDEMPOTENCY_KEY_HEADER, UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision": 1, "matches": []}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("UNKNOWN_FIELD"))
                .andExpect(jsonPath("$.error.fieldErrors[0].fieldPath").value("matches"));
    }

    private DraftFixture createSavedDraft() throws Exception {
        DraftFixture fixture = createManualBlankDraft();
        mockMvc.perform(put("/api/ocr/review-drafts/{ocrTaskId}", fixture.ocrTaskId())
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
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.revision").value(1));
        return fixture;
    }

    private DraftFixture createManualBlankDraft() throws Exception {
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
        return new DraftFixture(workflowId, ocrTaskId);
    }

    private record DraftFixture(String workflowId, String ocrTaskId) {
    }
}
