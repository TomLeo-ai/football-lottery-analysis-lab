package org.footballlab.llm.repository;

import org.footballlab.llm.domain.LlmInvocationAuditRecord;

public interface LlmInvocationAuditRepository {

    void save(LlmInvocationAuditRecord auditRecord);
}
