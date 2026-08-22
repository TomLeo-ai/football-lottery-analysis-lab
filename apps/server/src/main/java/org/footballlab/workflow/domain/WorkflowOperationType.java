package org.footballlab.workflow.domain;

public enum WorkflowOperationType {
    CREATE_WORKFLOW,
    PARSE_OCR,
    SAVE_DRAFT,
    CONFIRM_SNAPSHOT,
    ABANDON_WORKFLOW,
    GENERATE_REPORT,
    CREATE_PLAN
}
