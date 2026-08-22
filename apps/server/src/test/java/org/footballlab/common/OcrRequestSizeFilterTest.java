package org.footballlab.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.common.error.GlobalExceptionHandler;
import org.footballlab.common.web.OcrRequestSizeFilter;
import org.footballlab.common.web.TraceIdFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

class OcrRequestSizeFilterTest {

    private static final String TRACE_ID = "trace-test-size-001";

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(new TraceIdFilter(), new OcrRequestSizeFilter(new ObjectMapper()))
                .build();
    }

    @Test
    void rejectsLargeRevisionedDraftRequestBeforeBodyParsing() throws Exception {
        String body = "\"" + "A".repeat((int) OcrRequestSizeFilter.MAX_OCR_REVIEW_BYTES + 1) + "\"";

        MvcResult result = mockMvc.perform(post("/api/ocr/review-drafts/ocr-task-001")
                        .header(TraceIdFilter.TRACE_ID_HEADER, TRACE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(header().string(TraceIdFilter.TRACE_ID_HEADER, TRACE_ID))
                .andExpect(jsonPath("$.code").value(413))
                .andExpect(jsonPath("$.error.errorCode").value("REQUEST_TOO_LARGE"))
                .andExpect(jsonPath("$.error.traceId").value(TRACE_ID))
                .andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain("AAAAAA");
    }

    @Test
    void rejectsLargeLegacyOcrCandidateRequestAtTheSameBoundary() throws Exception {
        String body = "{" + "\"payload\":\"" + "B".repeat((int) OcrRequestSizeFilter.MAX_OCR_REVIEW_BYTES) + "\"}";

        mockMvc.perform(post("/api/ocr/parse-local-result")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.error.errorCode").value("REQUEST_TOO_LARGE"));
    }

    @Test
    void rejectsLargeChunkedOrUnknownLengthRequestWhileReading() throws Exception {
        String body = "\"" + "C".repeat((int) OcrRequestSizeFilter.MAX_OCR_REVIEW_BYTES + 1) + "\"";

        MvcResult result = mockMvc.perform(post("/api/ocr/review-drafts/ocr-task-001")
                        .header(TraceIdFilter.TRACE_ID_HEADER, TRACE_ID)
                        .header("Transfer-Encoding", "chunked")
                        .header("Content-Length", "-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.error.errorCode").value("REQUEST_TOO_LARGE"))
                .andExpect(jsonPath("$.error.traceId").value(TRACE_ID))
                .andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain("CCCCCC");
    }

    @Test
    void allowsSmallRevisionedDraftRequest() throws Exception {
        mockMvc.perform(post("/api/ocr/review-drafts/ocr-task-001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("\"small draft\""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ocrTaskId").value("ocr-task-001"))
                .andExpect(jsonPath("$.error").doesNotExist());
    }

    @RestController
    public static class TestController {

        @PostMapping("/api/ocr/review-drafts/{ocrTaskId}")
        public Result<Map<String, String>> saveDraft(@PathVariable String ocrTaskId, @RequestBody String requestBody) {
            return Result.success(Map.of("ocrTaskId", ocrTaskId, "body", requestBody));
        }
    }
}
