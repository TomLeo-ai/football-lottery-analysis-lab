package org.footballlab.common;

import com.fasterxml.jackson.annotation.JsonInclude;

import org.footballlab.common.error.ApiError;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record Result<T>(int code, String msg, T data, ApiError error) {

    public Result(int code, String msg, T data) {
        this(code, msg, data, null);
    }

    public static <T> Result<T> success(T data) {
        return new Result<>(200, "success", data, null);
    }

    public static <T> Result<T> success(int status, T data) {
        return new Result<>(status, "success", data, null);
    }
}

