package org.footballlab.workflow.service;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.footballlab.workflow.domain.WorkflowOperationRecord;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.footballlab.workflow.repository.WorkflowOperationRepository;
import org.footballlab.workflow.repository.WorkflowRepository;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class WorkflowOperationRecoveryService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final Duration STALE_AFTER = Duration.ofMinutes(15);
    private static final DateTimeFormatter STABLE_OFFSET_FORMAT =
            DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSSSSSSSSXXX");

    private final WorkflowOperationRepository operationRepository;
    private final WorkflowRepository workflowRepository;
    private final Clock clock;
    private final TransactionTemplate transactionTemplate;

    public WorkflowOperationRecoveryService(
            WorkflowOperationRepository operationRepository,
            WorkflowRepository workflowRepository,
            Clock clock,
            TransactionTemplate transactionTemplate) {
        this.operationRepository = operationRepository;
        this.workflowRepository = workflowRepository;
        this.clock = clock;
        this.transactionTemplate = transactionTemplate;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverOnStartup() {
        recoverStaleAnalysisOperations();
    }

    public int recoverStaleAnalysisOperations() {
        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), DEFAULT_ZONE);
        String cutoff = STABLE_OFFSET_FORMAT.format(now.minus(STALE_AFTER));
        String recoveredAt = STABLE_OFFSET_FORMAT.format(now);
        List<WorkflowOperationRecord> stale = operationRepository.findStaleInProgress(
                WorkflowOperationType.GENERATE_ANALYSIS,
                cutoff);
        int recovered = 0;
        for (WorkflowOperationRecord operation : stale) {
            Boolean changed = transactionTemplate.execute(status -> recoverOne(operation, cutoff, recoveredAt));
            if (Boolean.TRUE.equals(changed)) {
                recovered++;
            }
        }
        return recovered;
    }

    private boolean recoverOne(WorkflowOperationRecord operation, String cutoff, String recoveredAt) {
        boolean interrupted = operationRepository.interruptStale(
                operation.idempotencyKey(),
                WorkflowOperationType.GENERATE_ANALYSIS,
                cutoff,
                HttpStatus.CONFLICT.value(),
                recoveredAt);
        if (!interrupted) {
            return false;
        }
        if (operation.workflowId() != null) {
            workflowRepository.clearActiveOperation(
                    operation.workflowId(),
                    WorkflowOperationType.GENERATE_ANALYSIS,
                    operation.idempotencyKey(),
                    recoveredAt);
        }
        return true;
    }
}
