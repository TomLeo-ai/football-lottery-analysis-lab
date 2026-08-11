package org.footballlab.common;

public record Result<T>(int code, String msg, T data) {

    public static <T> Result<T> success(T data) {
        return new Result<>(200, "success", data);
    }
}

