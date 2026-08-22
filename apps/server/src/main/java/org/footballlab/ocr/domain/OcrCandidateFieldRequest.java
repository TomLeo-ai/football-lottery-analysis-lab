package org.footballlab.ocr.domain;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.json.StrictRequestFields;

public final class OcrCandidateFieldRequest {

    private String fieldId;
    private String scope;
    private String fieldName;
    private String value;
    private String matchRef;
    private BigDecimal confidence;
    private OcrBoundingBoxRequest boundingBox;

    public String getFieldId() {
        return fieldId;
    }

    public void setFieldId(String fieldId) {
        this.fieldId = fieldId;
    }

    public String getScope() {
        return scope;
    }

    public void setScope(String scope) {
        this.scope = scope;
    }

    public String getFieldName() {
        return fieldName;
    }

    public void setFieldName(String fieldName) {
        this.fieldName = fieldName;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public String getMatchRef() {
        return matchRef;
    }

    public void setMatchRef(String matchRef) {
        this.matchRef = matchRef;
    }

    public BigDecimal getConfidence() {
        return confidence;
    }

    public void setConfidence(BigDecimal confidence) {
        this.confidence = confidence;
    }

    public OcrBoundingBoxRequest getBoundingBox() {
        return boundingBox;
    }

    public void setBoundingBox(OcrBoundingBoxRequest boundingBox) {
        this.boundingBox = boundingBox;
    }

    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        StrictRequestFields.reject(name);
    }
}
