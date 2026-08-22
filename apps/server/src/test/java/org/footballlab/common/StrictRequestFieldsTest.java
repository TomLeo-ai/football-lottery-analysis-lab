package org.footballlab.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.footballlab.common.error.GlobalExceptionHandler;
import org.footballlab.common.json.StrictRequestFields;
import org.footballlab.common.web.OcrRequestSizeFilter;
import org.footballlab.common.web.TraceIdFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

class StrictRequestFieldsTest {

    private static final String TRACE_ID = "trace-test-strict-001";

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(new TraceIdFilter(), new OcrRequestSizeFilter(new ObjectMapper()))
                .build();
    }

    @Test
    void acceptsDeclaredStrictFields() throws Exception {
        mockMvc.perform(post("/test/strict")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"matchId\":\"demo-match-001\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matchId").value("demo-match-001"))
                .andExpect(jsonPath("$.error").doesNotExist());
    }

    @Test
    void rejectsUnknownStrictFieldWithoutEchoingItsValue() throws Exception {
        MvcResult result = mockMvc.perform(post("/test/strict")
                        .header(TraceIdFilter.TRACE_ID_HEADER, TRACE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"matchId\":\"demo-match-001\",\"rawText\":\"SECRET_RAW_OCR_SENTINEL\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.errorCode").value("UNKNOWN_FIELD"))
                .andExpect(jsonPath("$.error.fieldErrors[0].fieldPath").value("rawText"))
                .andExpect(jsonPath("$.error.traceId").value(TRACE_ID))
                .andReturn();

        assertThat(result.getResponse().getContentAsString())
                .doesNotContain("SECRET_RAW_OCR_SENTINEL");
    }

    @RestController
    public static class TestController {

        @PostMapping("/test/strict")
        public Result<Map<String, String>> strict(@Valid @RequestBody StrictPayload request) {
            return Result.success(Map.of("matchId", request.getMatchId()));
        }
    }

    static final class StrictPayload {
        @NotBlank
        private String matchId;

        public String getMatchId() {
            return matchId;
        }

        public void setMatchId(String matchId) {
            this.matchId = matchId;
        }

        @JsonAnySetter
        public void rejectUnknownField(String name, Object value) {
            StrictRequestFields.reject(name);
        }
    }
}
