package org.footballlab.official.domain;

public record OfficialLinkResponse(
        String id,
        String name,
        String url,
        String purpose,
        String region,
        String target,
        String rel,
        String nonOfficialNotice,
        String dataPolicy,
        String updatedAt) {
}

