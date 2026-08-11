package org.footballlab.resultprovider.domain;

public record PublicResultProviderSyncRequest(
        String providerKey,
        String requestedBy) {
}
