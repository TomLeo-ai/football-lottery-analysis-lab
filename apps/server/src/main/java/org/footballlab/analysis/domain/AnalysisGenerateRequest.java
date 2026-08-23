package org.footballlab.analysis.domain;

import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.error.ApiException;
import org.footballlab.common.error.ApiFieldError;
import org.footballlab.common.json.StrictRequestFields;
import org.springframework.http.HttpStatus;

public record AnalysisGenerateRequest(
        String snapshotId,
        String engineMode,
        String providerKey,
        String modelId,
        String promptVersion,
        AnalysisOptionsRequest analysisOptions) {

    private static final Set<String> CLIENT_AUTHORITY_FIELDS = Set.of(
            "sourceType",
            "analysisAllowed",
            "riskPreference",
            "budgetAmount",
            "currency",
            "strategyParameters",
            "matches",
            "markets",
            "workflowId",
            "authorityType",
            "authorityRevision",
            "snapshotStatus",
            "confirmedAt",
            "ocrTaskId");

    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        if (CLIENT_AUTHORITY_FIELDS.contains(name)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "CLIENT_ASSERTED_AUTHORITY_NOT_ALLOWED",
                    "Analysis authority must be loaded from the confirmed server snapshot.",
                    List.of(new ApiFieldError(name, "Client asserted authority is not allowed.")),
                    Map.of());
        }
        StrictRequestFields.reject(name);
    }
}
