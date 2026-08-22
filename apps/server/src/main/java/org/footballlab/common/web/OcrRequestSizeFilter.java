package org.footballlab.common.web;

import java.io.IOException;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
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
        if (!isOcrReviewWrite(request)) {
            filterChain.doFilter(request, response);
            return;
        }
        if (request.getContentLengthLong() > MAX_OCR_REVIEW_BYTES) {
            writeTooLargeResponse(request, response);
            return;
        }
        try {
            filterChain.doFilter(new SizeLimitedRequestWrapper(request), response);
        } catch (RequestBodyTooLargeException exception) {
            if (response.isCommitted()) {
                throw exception;
            }
            writeTooLargeResponse(request, response);
        }
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

    public static final class RequestBodyTooLargeException extends IOException {

        public RequestBodyTooLargeException() {
            super("OCR review request body exceeded the 512 KiB limit.");
        }
    }

    private static final class SizeLimitedRequestWrapper extends HttpServletRequestWrapper {

        private SizeLimitedRequestWrapper(HttpServletRequest request) {
            super(request);
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            return new LimitedServletInputStream(super.getInputStream());
        }
    }

    private static final class LimitedServletInputStream extends ServletInputStream {

        private final ServletInputStream delegate;
        private long bytesRead;

        private LimitedServletInputStream(ServletInputStream delegate) {
            this.delegate = delegate;
        }

        @Override
        public boolean isFinished() {
            return delegate.isFinished();
        }

        @Override
        public boolean isReady() {
            return delegate.isReady();
        }

        @Override
        public void setReadListener(ReadListener readListener) {
            delegate.setReadListener(readListener);
        }

        @Override
        public int read() throws IOException {
            int value = delegate.read();
            if (value != -1) {
                recordBytes(1);
            }
            return value;
        }

        @Override
        public int read(byte[] bytes, int offset, int length) throws IOException {
            int count = delegate.read(bytes, offset, length);
            if (count > 0) {
                recordBytes(count);
            }
            return count;
        }

        @Override
        public int readLine(byte[] bytes, int offset, int length) throws IOException {
            int count = delegate.readLine(bytes, offset, length);
            if (count > 0) {
                recordBytes(count);
            }
            return count;
        }

        private void recordBytes(int count) throws RequestBodyTooLargeException {
            bytesRead += count;
            if (bytesRead > MAX_OCR_REVIEW_BYTES) {
                throw new RequestBodyTooLargeException();
            }
        }
    }
}
