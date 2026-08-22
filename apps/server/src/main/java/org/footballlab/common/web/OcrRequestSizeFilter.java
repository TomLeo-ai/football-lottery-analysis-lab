package org.footballlab.common.web;

import java.io.IOException;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.footballlab.common.Result;
import org.footballlab.common.error.ApiError;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class OcrRequestSizeFilter extends OncePerRequestFilter {

    public static final long MAX_OCR_REVIEW_BYTES = 512L * 1024L;

    private final ObjectMapper objectMapper;

    public OcrRequestSizeFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if (isOcrReviewWrite(request) && request.getContentLengthLong() > MAX_OCR_REVIEW_BYTES) {
            writeTooLargeResponse(request, response);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private boolean isOcrReviewWrite(HttpServletRequest request) {
        String method = request.getMethod();
        if (!List.of("POST", "PUT", "PATCH").contains(method)) {
            return false;
        }
        String path = request.getRequestURI();
        return path.equals("/api/ocr/parse-local-result")
                || path.equals("/api/ocr/review/confirm")
                || path.startsWith("/api/ocr/review-drafts/");
    }

    private void writeTooLargeResponse(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String traceId = TraceIdFilter.traceIdFrom(request);
        ApiError apiError = new ApiError(
                "REQUEST_TOO_LARGE",
                "OCR review request body must not exceed 512 KiB.",
                traceId,
                List.of(),
                null
        );
        response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
        response.setCharacterEncoding("UTF-8");
        response.setHeader(TraceIdFilter.TRACE_ID_HEADER, traceId);
        response.setHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), new Result<>(HttpStatus.PAYLOAD_TOO_LARGE.value(), "error", null, apiError));
    }
}
