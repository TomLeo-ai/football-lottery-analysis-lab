package org.footballlab.workflow.domain;

import java.util.EnumSet;
import java.util.Set;

public enum WorkflowStage {
    WAITING_LOCAL_OCR,
    WAITING_USER_CONFIRMATION,
    CONFIRMED,
    ANALYSIS_GENERATED,
    PLAN_GENERATED,
    PENDING_RESULT,
    ABANDONED;

    public boolean canTransitionTo(WorkflowStage nextStage) {
        if (this == nextStage) {
            return true;
        }
        return legalNextStages().contains(nextStage);
    }

    private Set<WorkflowStage> legalNextStages() {
        return switch (this) {
            case WAITING_LOCAL_OCR -> EnumSet.of(WAITING_USER_CONFIRMATION, ABANDONED);
            case WAITING_USER_CONFIRMATION -> EnumSet.of(CONFIRMED, ABANDONED);
            case CONFIRMED -> EnumSet.of(ANALYSIS_GENERATED);
            case ANALYSIS_GENERATED -> EnumSet.of(PLAN_GENERATED);
            case PLAN_GENERATED -> EnumSet.of(PENDING_RESULT);
            case PENDING_RESULT, ABANDONED -> EnumSet.noneOf(WorkflowStage.class);
        };
    }
}
