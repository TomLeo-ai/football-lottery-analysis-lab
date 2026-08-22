package org.footballlab.ocr.domain;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.json.StrictRequestFields;

public final class OcrReviewConfirmRequest {

    private Long expectedRevision;

    public Long getExpectedRevision() {
        return expectedRevision;
    }

    public void setExpectedRevision(Long expectedRevision) {
        this.expectedRevision = expectedRevision;
    }

    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        StrictRequestFields.reject(name);
    }
}

