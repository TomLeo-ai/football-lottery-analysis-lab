package org.footballlab.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.footballlab.common.error.ApiException;
import org.footballlab.common.error.ApiFieldError;
import org.footballlab.common.error.GlobalExceptionHandler;
import org.footballlab.common.web.OcrRequestSizeFilter;
import org.footballlab.common.web.TraceIdFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

class GlobalExceptionHandlerTest {

    private static final String TRACE_ID = "trace-test-global-001";

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(new TraceIdFilter(), new OcrRequestSizeFilter(new ObjectMapper()))
                .build();
    }

    @Test
    void validationErrorUsesStableEnvelopeTraceIdAndFieldPath() throws Exception {
        mockMvc.perform(post("/test/validation")
                        .header(TraceIdFilter.TRACE_ID_HEADER, TRACE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(header().string(TraceIdFilter.TRACE_ID_HEADER, TRACE_ID))
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.msg").value("error"))
                .andExpect(jsonPath("$.data").doesNotExist())
                .andExpect(jsonPath("$.error.errorCode").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.error.message").value("Request validation failed."))
                .andExpect(jsonPath("$.error.traceId").value(TRACE_ID))
                .andExpect(jsonPath("$.error.fieldErrors[0].fieldPath").value("name"))
                .andExpect(jsonPath("$.error.fieldErrors[0].message").value("name is required"));
    }

    @Test
    void apiExceptionReturnsOnlyApprovedRecoveryData() throws Exception {
        mockMvc.perform(get("/test/api-exception")
                        .header(TraceIdFilter.TRACE_ID_HEADER, TRACE_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.errorCode").value("WORKFLOW_VERSION_CONFLICT"))
                .andExpect(jsonPath("$.error.fieldErrors[0].fieldPath").value("expectedVersion"))
                .andExpect(jsonPath("$.error.recovery.currentVersion").value(2))
                .andExpect(jsonPath("$.error.traceId").value(TRACE_ID));
    }

    @Test
    void malformedJsonIsSafeAndDoesNotEchoRequestBody() throws Exception {
        MvcResult result = mockMvc.perform(post("/test/validation")
                        .header(TraceIdFilter.TRACE_ID_HEADER, TRACE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"SECRET_RAW_BODY_SENTINEL\","))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("MALFORMED_JSON"))
                .andExpect(jsonPath("$.error.traceId").value(TRACE_ID))
                .andReturn();

        assertThat(result.getResponse().getContentAsString())
                .doesNotContain("SECRET_RAW_BODY_SENTINEL")
                .doesNotContain("HttpMessageNotReadableException");
    }

    @Test
    void unexpectedExceptionIsSanitized() throws Exception {
        MvcResult result = mockMvc.perform(get("/test/unexpected")
                        .header(TraceIdFilter.TRACE_ID_HEADER, TRACE_ID))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error.errorCode").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.error.message").value("Unexpected server error."))
                .andReturn();

        assertThat(result.getResponse().getContentAsString())
                .doesNotContain("SECRET_EXCEPTION_SENTINEL")
                .doesNotContain("IllegalStateException");
    }

    @Test
    void successfulResultKeepsLegacyThreeFieldShape() throws Exception {
        mockMvc.perform(get("/test/success"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.msg").value("success"))
                .andExpect(jsonPath("$.data.ok").value(true))
                .andExpect(jsonPath("$.error").doesNotExist());
    }

    @RestController
    public static class TestController {

        @PostMapping("/test/validation")
        public Result<Map<String, String>> validation(@Valid @RequestBody ValidationRequest request) {
            return Result.success(Map.of("name", request.name()));
        }

        @GetMapping("/test/api-exception")
        public Result<Void> apiException() {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "WORKFLOW_VERSION_CONFLICT",
                    "Workflow version conflict.",
                    List.of(new ApiFieldError("expectedVersion", "The submitted version is stale.")),
                    Map.of("currentVersion", 2)
            );
        }

        @GetMapping("/test/unexpected")
        public Result<Void> unexpected() {
            throw new IllegalStateException("SECRET_EXCEPTION_SENTINEL");
        }

        @GetMapping("/test/success")
        public Result<Map<String, Boolean>> success() {
            return Result.success(Map.of("ok", true));
        }
    }

    record ValidationRequest(@NotBlank(message = "name is required") String name) {
    }
}
