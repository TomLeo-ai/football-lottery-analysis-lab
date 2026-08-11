package org.footballlab.llm.domain;

public record LlmHttpRequest(
        String url,
        String authorizationHeader,
        String body) {

    @Override
    public String toString() {
        return "LlmHttpRequest[url=%s, authorizationHeader=***, body=%s]".formatted(url, body);
    }
}
