package org.footballlab.ocr.persistence;

import java.util.List;

import org.footballlab.ocr.domain.OcrCandidateFieldRequest;

public record OcrCandidatePayloadV2(
        String schemaVersion,
        String entryMode,
        String ocrEngine,
        String ocrEngineVersion,
        List<String> languages,
        int processedWidth,
        int processedHeight,
        List<OcrCandidateFieldRequest> candidateFields
) {
}
