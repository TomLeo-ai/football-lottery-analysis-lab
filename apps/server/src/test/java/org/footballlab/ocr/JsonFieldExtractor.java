package org.footballlab.ocr;

import static org.assertj.core.api.Assertions.assertThat;

final class JsonFieldExtractor {

    private JsonFieldExtractor() {
    }

    static String extractString(String json, String fieldName) {
        String marker = "\"" + fieldName + "\":\"";
        int start = json.indexOf(marker);
        assertThat(start).isGreaterThanOrEqualTo(0);
        int valueStart = start + marker.length();
        int valueEnd = json.indexOf('"', valueStart);
        assertThat(valueEnd).isGreaterThan(valueStart);
        return json.substring(valueStart, valueEnd);
    }
}
