package org.footballlab.workflow.service;

import java.lang.reflect.Array;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.workflow.domain.WorkflowOperationType;
import org.springframework.stereotype.Service;

@Service
public class RequestHashService {

    private static final Set<String> EXCLUDED_KEYS = Set.of(
            "apikey",
            "authorization",
            "rawjson",
            "rawtext",
            "timestamp",
            "traceid",
            "xtraceid");

    private final ObjectMapper objectMapper;

    public RequestHashService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String hash(
            WorkflowOperationType operationType,
            String httpMethod,
            String normalizedPath,
            Map<String, ?> normalizedFields
    ) {
        Map<String, Object> canonical = new TreeMap<>();
        canonical.put("httpMethod", httpMethod.toUpperCase(Locale.ROOT));
        canonical.put("normalizedPath", normalizedPath);
        canonical.put("operationType", operationType.name());
        canonical.put("request", normalizeValue(normalizedFields == null ? Map.of() : normalizedFields));
        return sha256(toJson(canonical));
    }

    private Object normalizeValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> normalizedMap = new TreeMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                String key = String.valueOf(entry.getKey());
                if (!isExcludedKey(key)) {
                    normalizedMap.put(key, normalizeValue(entry.getValue()));
                }
            }
            return normalizedMap;
        }
        if (value instanceof Collection<?> collection) {
            return collection.stream().map(this::normalizeValue).toList();
        }
        if (value.getClass().isArray()) {
            int length = Array.getLength(value);
            ArrayList<Object> normalizedValues = new ArrayList<>(length);
            for (int i = 0; i < length; i++) {
                normalizedValues.add(normalizeValue(Array.get(value, i)));
            }
            return normalizedValues;
        }
        if (value instanceof BigDecimal decimal) {
            return normalizeDecimal(decimal);
        }
        if (value instanceof Float || value instanceof Double) {
            return normalizeDecimal(BigDecimal.valueOf(((Number) value).doubleValue()));
        }
        if (value instanceof Enum<?> enumValue) {
            return enumValue.name().toUpperCase(Locale.ROOT);
        }
        if (value instanceof UUID uuid) {
            return uuid.toString().toUpperCase(Locale.ROOT);
        }
        if (value instanceof CharSequence text) {
            return normalizeString(text.toString());
        }
        return value;
    }

    private boolean isExcludedKey(String key) {
        return EXCLUDED_KEYS.contains(key.replace("-", "").replace("_", "").toLowerCase(Locale.ROOT));
    }

    private String normalizeString(String value) {
        try {
            return UUID.fromString(value).toString().toUpperCase(Locale.ROOT);
        } catch (IllegalArgumentException ignored) {
            return value;
        }
    }

    private String normalizeDecimal(BigDecimal decimal) {
        BigDecimal normalized = decimal.stripTrailingZeros();
        if (normalized.scale() < 0) {
            normalized = normalized.setScale(0);
        }
        return normalized.toPlainString();
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize canonical workflow request.", exception);
        }
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 digest is not available.", exception);
        }
    }
}
