package org.footballlab.common.json;

import java.util.List;

import org.footballlab.common.error.ApiException;
import org.footballlab.common.error.ApiFieldError;
import org.springframework.http.HttpStatus;

public final class StrictRequestFields {

    private StrictRequestFields() {
    }

    public static void reject(String fieldName) {
        throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "UNKNOWN_FIELD",
                "Request contains an unsupported field.",
                List.of(new ApiFieldError(fieldName, "Field is not allowed.")),
                null
        );
    }
}
