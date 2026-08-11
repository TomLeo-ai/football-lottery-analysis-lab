package org.footballlab.llm.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.Instant;

import org.footballlab.llm.domain.LlmHttpRequest;
import org.footballlab.llm.domain.LlmHttpResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class JavaNetLlmHttpTransport implements LlmHttpTransport {

    private static final Duration DEFAULT_CONNECT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration DEFAULT_REQUEST_TIMEOUT = Duration.ofSeconds(90);

    private final HttpClient httpClient;
    private final Duration requestTimeout;

    public JavaNetLlmHttpTransport() {
        this(DEFAULT_CONNECT_TIMEOUT, DEFAULT_REQUEST_TIMEOUT);
    }

    public JavaNetLlmHttpTransport(Duration connectTimeout, Duration requestTimeout) {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(connectTimeout)
                .build();
        this.requestTimeout = requestTimeout;
    }

    @Override
    public LlmHttpResponse exchange(LlmHttpRequest request) {
        Instant startedAt = Instant.now();
        HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(request.url()))
                .timeout(requestTimeout)
                .header("Authorization", request.authorizationHeader())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(request.body()))
                .build();

        try {
            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            return new LlmHttpResponse(
                    response.statusCode(),
                    response.body(),
                    Duration.between(startedAt, Instant.now()).toMillis());
        } catch (HttpTimeoutException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "LLM_HTTP_TIMEOUT", exception);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "LLM_HTTP_IO_ERROR", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "LLM_HTTP_INTERRUPTED", exception);
        }
    }
}
