package org.footballlab.review.domain;

public record ReviewSettleRequest(
        String reviewEngineMode,
        String providerKey,
        String modelId,
        String promptVersion) {
}
