package org.footballlab.ocr.persistence;

import java.util.List;

public record OcrReviewDraftPayloadV2(
        String schemaVersion,
        long revision,
        List<Object> matches,
        List<Object> markets
) {
}
