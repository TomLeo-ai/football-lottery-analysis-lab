package org.footballlab.llm.repository;

import org.footballlab.llm.domain.LlmInvocationAuditRecord;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcLlmInvocationAuditRepository implements LlmInvocationAuditRepository {

    private final JdbcTemplate jdbcTemplate;

    public JdbcLlmInvocationAuditRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void save(LlmInvocationAuditRecord auditRecord) {
        jdbcTemplate.update("""
                        insert into llm_invocation_audit (
                            audit_id,
                            business_type,
                            business_id,
                            provider_key,
                            model_id,
                            prompt_version,
                            input_hash,
                            output_hash,
                            prompt_tokens,
                            completion_tokens,
                            total_tokens,
                            latency_ms,
                            safety_status,
                            error_code,
                            created_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                auditRecord.auditId(),
                auditRecord.businessType(),
                auditRecord.businessId(),
                auditRecord.providerKey(),
                auditRecord.modelId(),
                auditRecord.promptVersion(),
                auditRecord.inputHash(),
                auditRecord.outputHash(),
                auditRecord.promptTokens(),
                auditRecord.completionTokens(),
                auditRecord.totalTokens(),
                auditRecord.latencyMs(),
                auditRecord.safetyStatus(),
                auditRecord.errorCode(),
                auditRecord.createdAt());
    }
}
