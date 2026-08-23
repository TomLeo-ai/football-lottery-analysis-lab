package org.footballlab.system.domain;

public record BuildInfoResponse(
        String artifact,
        String version,
        String verificationRunId) {
}
