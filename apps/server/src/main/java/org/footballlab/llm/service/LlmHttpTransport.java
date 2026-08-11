package org.footballlab.llm.service;

import org.footballlab.llm.domain.LlmHttpRequest;
import org.footballlab.llm.domain.LlmHttpResponse;

public interface LlmHttpTransport {

    LlmHttpResponse exchange(LlmHttpRequest request);
}
