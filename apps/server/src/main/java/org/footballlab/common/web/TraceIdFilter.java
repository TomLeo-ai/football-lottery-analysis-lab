package org.footballlab.common.web;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

    public static final String TRACE_ID_HEADER = "X-Trace-Id";
    public static final String TRACE_ID_ATTRIBUTE = TraceIdFilter.class.getName() + ".traceId";

    private static final Pattern SAFE_TRACE_ID = Pattern.compile("[A-Za-z0-9._:-]{1,128}");

    public static String traceIdFrom(HttpServletRequest request) {
        Object value = request.getAttribute(TRACE_ID_ATTRIBUTE);
        return value instanceof String traceId ? traceId : "trace-" + UUID.randomUUID();
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String traceId = normalizeTraceId(request.getHeader(TRACE_ID_HEADER));
        request.setAttribute(TRACE_ID_ATTRIBUTE, traceId);
        response.setHeader(TRACE_ID_HEADER, traceId);
        filterChain.doFilter(request, response);
    }

    private String normalizeTraceId(String headerValue) {
        if (headerValue != null && SAFE_TRACE_ID.matcher(headerValue).matches()) {
            return headerValue;
        }
        return "trace-" + UUID.randomUUID();
    }
}
