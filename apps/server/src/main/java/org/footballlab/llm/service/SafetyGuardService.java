package org.footballlab.llm.service;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SafetyGuardService {

    private static final List<String> BLOCKED_TERMS = List.of(
            "\u5fc5\u4e2d",
            "\u5fc5\u80dc",
            "\u7a33\u8d62",
            "\u7a33\u8d5a",
            "\u5305\u4e2d",
            "\u56de\u672c",
            "\u8ddf\u6295",
            "\u52a0\u6ce8",
            "\u5b9e\u5355\u63a8\u8350",
            "\u4fdd\u8bc1\u6536\u76ca",
            "\u65e0\u98ce\u9669",
            "\u7a33\u80c6\u5fc5\u8fc7");

    public void assertSafe(String text) {
        for (String term : BLOCKED_TERMS) {
            if (text != null && text.contains(term)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "BLOCKED_TERM");
            }
        }
    }
}
