package org.footballlab.common.error;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiError(
        String errorCode,
        String message,
        String traceId,
        List<ApiFieldError> fieldErrors,
        Map<String, Object> recovery
) {

    public ApiError {
        fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
        recovery = recovery == null ? Map.of() : Map.copyOf(recovery);
    }
}
