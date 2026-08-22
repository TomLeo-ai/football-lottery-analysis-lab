package org.footballlab.common.error;

import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.footballlab.common.Result;
import org.footballlab.common.web.TraceIdFilter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Result<Object>> handleApiException(ApiException exception, HttpServletRequest request) {
        return errorResponse(
                exception.status(),
                exception.errorCode(),
                exception.safeMessage(),
                exception.fieldErrors(),
                exception.recovery(),
                request
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Result<Object>> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        List<ApiFieldError> fieldErrors = exception.getBindingResult().getFieldErrors()
                .stream()
                .map(this::toApiFieldError)
                .toList();
        return errorResponse(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                "Request validation failed.",
                fieldErrors,
                Map.of(),
                request
        );
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Result<Object>> handleUnreadableJson(
            HttpMessageNotReadableException exception,
            HttpServletRequest request
    ) {
        ApiException apiException = findApiException(exception);
        if (apiException != null) {
            return handleApiException(apiException, request);
        }
        return errorResponse(
                HttpStatus.BAD_REQUEST,
                "MALFORMED_JSON",
                "Malformed JSON request.",
                List.of(),
                Map.of(),
                request
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Result<Object>> handleUnexpected(Exception exception, HttpServletRequest request) {
        return errorResponse(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "Unexpected server error.",
                List.of(),
                Map.of(),
                request
        );
    }

    private ApiFieldError toApiFieldError(FieldError fieldError) {
        String message = fieldError.getDefaultMessage();
        return new ApiFieldError(fieldError.getField(), message == null ? "Invalid field value." : message);
    }

    private ApiException findApiException(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof ApiException apiException) {
                return apiException;
            }
            current = current.getCause();
        }
        return null;
    }

    private ResponseEntity<Result<Object>> errorResponse(
            HttpStatus status,
            String errorCode,
            String message,
            List<ApiFieldError> fieldErrors,
            Map<String, Object> recovery,
            HttpServletRequest request
    ) {
        String traceId = TraceIdFilter.traceIdFrom(request);
        ApiError apiError = new ApiError(errorCode, message, traceId, fieldErrors, recovery);
        return ResponseEntity
                .status(status)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .body(new Result<>(status.value(), "error", null, apiError));
    }
}
