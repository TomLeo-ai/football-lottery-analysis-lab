package org.footballlab.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.sun.net.httpserver.HttpServer;
import org.footballlab.llm.domain.LlmHttpRequest;
import org.footballlab.llm.service.JavaNetLlmHttpTransport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class JavaNetLlmHttpTransportTest {

    @Test
    void shouldClassifyRequestTimeoutSeparatelyFromGenericIoErrors() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        server.createContext("/chat/completions", exchange -> {
            try {
                Thread.sleep(500);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
            exchange.sendResponseHeaders(200, 0);
            exchange.close();
        });
        server.setExecutor(executor);
        server.start();

        try {
            int port = server.getAddress().getPort();
            JavaNetLlmHttpTransport transport = new JavaNetLlmHttpTransport(
                    Duration.ofMillis(100),
                    Duration.ofMillis(100));

            assertThatThrownBy(() -> transport.exchange(new LlmHttpRequest(
                            "http://127.0.0.1:" + port + "/chat/completions",
                            "Bearer unit-test-secret",
                            "{}")))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(exception -> {
                        ResponseStatusException responseException = (ResponseStatusException) exception;
                        assertThat(responseException.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
                        assertThat(responseException.getReason()).isEqualTo("LLM_HTTP_TIMEOUT");
                    });
        } finally {
            server.stop(0);
            executor.shutdownNow();
        }
    }
}
