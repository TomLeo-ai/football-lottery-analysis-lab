package org.footballlab.ocr.domain;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.json.StrictRequestFields;

public final class OcrCandidateParseRequest {

    private long expectedVersion;
    private String entryMode;
    private boolean replaceDraft;
    private String ocrEngine;
    private String ocrEngineVersion;
    private List<String> languages = List.of();
    private int processedWidth;
    private int processedHeight;
    private List<OcrCandidateFieldRequest> candidateFields = List.of();

    public long getExpectedVersion() {
        return expectedVersion;
    }

    public void setExpectedVersion(long expectedVersion) {
        this.expectedVersion = expectedVersion;
    }

    public String getEntryMode() {
        return entryMode;
    }

    public void setEntryMode(String entryMode) {
        this.entryMode = entryMode;
    }

    public boolean isReplaceDraft() {
        return replaceDraft;
    }

    public void setReplaceDraft(boolean replaceDraft) {
        this.replaceDraft = replaceDraft;
    }

    public String getOcrEngine() {
        return ocrEngine;
    }

    public void setOcrEngine(String ocrEngine) {
        this.ocrEngine = ocrEngine;
    }

    public String getOcrEngineVersion() {
        return ocrEngineVersion;
    }

    public void setOcrEngineVersion(String ocrEngineVersion) {
        this.ocrEngineVersion = ocrEngineVersion;
    }

    public List<String> getLanguages() {
        return languages;
    }

    public void setLanguages(List<String> languages) {
        this.languages = languages == null ? List.of() : List.copyOf(languages);
    }

    public int getProcessedWidth() {
        return processedWidth;
    }

    public void setProcessedWidth(int processedWidth) {
        this.processedWidth = processedWidth;
    }

    public int getProcessedHeight() {
        return processedHeight;
    }

    public void setProcessedHeight(int processedHeight) {
        this.processedHeight = processedHeight;
    }

    public List<OcrCandidateFieldRequest> getCandidateFields() {
        return candidateFields;
    }

    public void setCandidateFields(List<OcrCandidateFieldRequest> candidateFields) {
        this.candidateFields = candidateFields == null ? List.of() : List.copyOf(candidateFields);
    }

    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        StrictRequestFields.reject(name);
    }
}
