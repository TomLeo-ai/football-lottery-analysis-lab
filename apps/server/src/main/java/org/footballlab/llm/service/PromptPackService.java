package org.footballlab.llm.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PromptPackService {

    public String loadPrompt(String promptKey) {
        String resourcePath = "prompts/%s.md".formatted(promptKey);
        ClassLoader classLoader = Thread.currentThread().getContextClassLoader();

        try (InputStream inputStream = classLoader.getResourceAsStream(resourcePath)) {
            if (inputStream == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Prompt not found: " + promptKey);
            }
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Prompt load failed: " + promptKey, exception);
        }
    }
}
