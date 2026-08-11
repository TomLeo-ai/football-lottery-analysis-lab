package org.footballlab.resultprovider.domain;

import java.math.BigDecimal;
import java.util.List;

public record PublicResultProviderStatusResponse(
        String providerKey,
        String providerName,
        String providerType,
        boolean providerEnabled,
        String syncStatus,
        int snapshotCount,
        String lastFetchedAt,
        BigDecimal lastConfidence,
        String sourceName,
        String sourceUrl,
        String sourceLicense,
        String dataPolicy,
        String complianceNotice,
        List<PublicResultSnapshotResponse> snapshots) {
}
