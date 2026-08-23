package org.footballlab.plan.domain;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.error.ApiException;
import org.footballlab.common.error.ApiFieldError;
import org.springframework.http.HttpStatus;

public record StrategySimulationRequest(String reportId) {

    @JsonAnySetter
    public void rejectClientAssertedReport(String name, Object value) {
        throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "CLIENT_ASSERTED_REPORT_NOT_ALLOWED",
                "Plan inputs must be loaded from the persisted server analysis report.",
                List.of(new ApiFieldError(name, "Client asserted report content is not allowed.")),
                Map.of());
    }
}
