package org.footballlab.resultprovider.service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import org.footballlab.resultprovider.domain.PublicResultProviderStatusResponse;
import org.footballlab.resultprovider.domain.PublicResultProviderSyncRequest;
import org.footballlab.resultprovider.domain.PublicResultSnapshotResponse;
import org.footballlab.resultprovider.repository.PublicResultSnapshotRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MockPublicResultProviderService implements PublicResultProviderService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final String PROVIDER_KEY = "mock-public-results";
    private static final String PROVIDER_NAME = "Mock Public Result Provider";
    private static final String PROVIDER_TYPE = "MOCK";
    private static final String SOURCE_URL = "https://example.com/mock-public-results";
    private static final String SOURCE_LICENSE = "Fictional sample for local tests only";
    private static final String DATA_POLICY = "Mock provider uses fictional public sports result samples only; no official page integration.";
    private static final String COMPLIANCE_NOTICE = "非官方 Mock 公开赛果源，仅用于模拟复盘流程验证。";
    private static final BigDecimal CONFIDENCE = BigDecimal.valueOf(0.98);

    private final PublicResultSnapshotRepository publicResultSnapshotRepository;
    private final AtomicLong snapshotSequence;

    public MockPublicResultProviderService(PublicResultSnapshotRepository publicResultSnapshotRepository) {
        this.publicResultSnapshotRepository = publicResultSnapshotRepository;
        this.snapshotSequence = new AtomicLong(publicResultSnapshotRepository.nextSnapshotSequence());
    }

    @Override
    public PublicResultProviderStatusResponse sync(PublicResultProviderSyncRequest request) {
        validateRequest(request);

        String fetchedAt = OffsetDateTime.now(DEFAULT_ZONE).toString();
        List<PublicResultSnapshotResponse> snapshots = List.of(
                new PublicResultSnapshotResponse(
                        "result-snapshot-%06d".formatted(snapshotSequence.getAndIncrement()),
                        "demo-match-001",
                        "2026-07-01",
                        "Fictional Coastal League",
                        "Northport United",
                        "Lakeside City",
                        "2026-07-01T19:30:00+08:00",
                        2,
                        1,
                        "FINISHED",
                        PROVIDER_NAME,
                        SOURCE_URL,
                        SOURCE_LICENSE,
                        fetchedAt,
                        CONFIDENCE));

        publicResultSnapshotRepository.saveAll(snapshots);
        return buildStatus("SYNCED", fetchedAt, CONFIDENCE, snapshots);
    }

    @Override
    public PublicResultProviderStatusResponse status() {
        List<PublicResultSnapshotResponse> snapshots = publicResultSnapshotRepository.listLatest();
        if (snapshots.isEmpty()) {
            return buildStatus("IDLE", null, null, List.of());
        }
        String lastFetchedAt = snapshots.stream()
                .map(PublicResultSnapshotResponse::fetchedAt)
                .max(String::compareTo)
                .orElse(null);
        BigDecimal lastConfidence = snapshots.stream()
                .map(PublicResultSnapshotResponse::confidence)
                .min(Comparator.naturalOrder())
                .orElse(null);
        return buildStatus("SYNCED", lastFetchedAt, lastConfidence, snapshots);
    }

    private void validateRequest(PublicResultProviderSyncRequest request) {
        if (request == null || request.providerKey() == null || request.providerKey().isBlank()) {
            return;
        }
        if (!PROVIDER_KEY.equals(request.providerKey())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported result provider.");
        }
    }

    private PublicResultProviderStatusResponse buildStatus(
            String syncStatus,
            String lastFetchedAt,
            BigDecimal lastConfidence,
            List<PublicResultSnapshotResponse> snapshots) {
        return new PublicResultProviderStatusResponse(
                PROVIDER_KEY,
                PROVIDER_NAME,
                PROVIDER_TYPE,
                true,
                syncStatus,
                snapshots.size(),
                lastFetchedAt,
                lastConfidence,
                PROVIDER_NAME,
                SOURCE_URL,
                SOURCE_LICENSE,
                DATA_POLICY,
                COMPLIANCE_NOTICE,
                snapshots);
    }
}
