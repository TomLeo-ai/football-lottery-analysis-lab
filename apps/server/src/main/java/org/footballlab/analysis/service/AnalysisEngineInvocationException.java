package org.footballlab.analysis.service;

import java.util.Objects;

import org.footballlab.llm.domain.LlmInvocationAuditRecord;
import org.springframework.http.HttpStatus;

public final class AnalysisEngineInvocationException extends RuntimeException {

    private final HttpStatus status;
    private final String errorCode;
    private final String safeMessage;
    private final LlmInvocationAuditRecord failureAudit;

    public AnalysisEngineInvocationException(
            HttpStatus status,
            String errorCode,
            String safeMessage,
            LlmInvocationAuditRecord failureAudit) {
        super(safeMessage);
        this.status = Objects.requireNonNull(status, "status");
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode");
        this.safeMessage = Objects.requireNonNull(safeMessage, "safeMessage");
        this.failureAudit = Objects.requireNonNull(failureAudit, "failureAudit");
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

    public LlmInvocationAuditRecord failureAudit() {
        return failureAudit;
    }

    @Override
    public String toString() {
        return getClass().getName() + ": status=" + status.value()
                + ", errorCode=" + errorCode + ", message=" + safeMessage;
    }
}
