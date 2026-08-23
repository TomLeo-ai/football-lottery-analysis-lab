package org.footballlab.plan.domain;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.error.ApiException;
import org.footballlab.common.error.ApiFieldError;
import org.springframework.http.HttpStatus;

public record SimulatedPlanSaveRequest(
        String generatedPlanId,
        String operatorNote) {

    @JsonAnySetter
    public void rejectClientAssertedPlan(String name, Object value) {
        throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "CLIENT_ASSERTED_REPORT_NOT_ALLOWED",
                "Plan state must be loaded from persisted server records.",
                List.of(new ApiFieldError(name, "Client asserted plan content is not allowed.")),
                Map.of());
    }
}
