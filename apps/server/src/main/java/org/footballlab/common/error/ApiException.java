package org.footballlab.common.error;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;

public final class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String errorCode;
    private final String safeMessage;
    private final List<ApiFieldError> fieldErrors;
    private final Map<String, Object> recovery;

    public ApiException(HttpStatus status, String errorCode, String safeMessage) {
        this(status, errorCode, safeMessage, List.of(), Map.of());
    }

    public ApiException(
            HttpStatus status,
            String errorCode,
            String safeMessage,
            List<ApiFieldError> fieldErrors,
            Map<String, Object> recovery
    ) {
        super(safeMessage);
        this.status = status;
        this.errorCode = errorCode;
        this.safeMessage = safeMessage;
        this.fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
        this.recovery = recovery == null ? Map.of() : Map.copyOf(recovery);
    }

    public HttpStatus status() {
        return status;
    }

    public String errorCode() {
        return errorCode;
    }

    public String safeMessage() {
        return safeMessage;
    }

    public List<ApiFieldError> fieldErrors() {
        return fieldErrors;
    }

    public Map<String, Object> recovery() {
        return recovery;
    }
}
