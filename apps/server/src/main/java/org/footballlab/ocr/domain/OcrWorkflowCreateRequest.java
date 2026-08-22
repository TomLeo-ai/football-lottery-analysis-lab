package org.footballlab.ocr.domain;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.json.StrictRequestFields;

public final class OcrWorkflowCreateRequest {

    private String sourceDeclaration;
    private String sourcePolicyVersion;
    private String contentType;
    private long byteSize;
    private int width;
    private int height;

    public String getSourceDeclaration() {
        return sourceDeclaration;
    }

    public void setSourceDeclaration(String sourceDeclaration) {
        this.sourceDeclaration = sourceDeclaration;
    }

    public String getSourcePolicyVersion() {
        return sourcePolicyVersion;
    }

    public void setSourcePolicyVersion(String sourcePolicyVersion) {
        this.sourcePolicyVersion = sourcePolicyVersion;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public long getByteSize() {
        return byteSize;
    }

    public void setByteSize(long byteSize) {
        this.byteSize = byteSize;
    }

    public int getWidth() {
        return width;
    }

    public void setWidth(int width) {
        this.width = width;
    }

    public int getHeight() {
        return height;
    }

    public void setHeight(int height) {
        this.height = height;
    }

    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        StrictRequestFields.reject(name);
    }
}
