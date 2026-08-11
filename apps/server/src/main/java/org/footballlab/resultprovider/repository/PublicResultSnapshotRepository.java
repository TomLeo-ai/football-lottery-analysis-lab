package org.footballlab.resultprovider.repository;

import java.util.List;
import java.util.Optional;

import org.footballlab.resultprovider.domain.PublicResultSnapshotResponse;

public interface PublicResultSnapshotRepository {

    void saveAll(List<PublicResultSnapshotResponse> snapshots);

    Optional<PublicResultSnapshotResponse> findById(String resultSnapshotId);

    List<PublicResultSnapshotResponse> listLatest();

    long nextSnapshotSequence();
}
