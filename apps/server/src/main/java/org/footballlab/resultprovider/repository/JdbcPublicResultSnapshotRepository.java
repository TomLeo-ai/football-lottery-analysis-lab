package org.footballlab.resultprovider.repository;

import java.util.List;
import java.util.Comparator;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.resultprovider.domain.PublicResultSnapshotResponse;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcPublicResultSnapshotRepository implements PublicResultSnapshotRepository {

    private static final String SNAPSHOT_PREFIX = "result-snapshot-";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcPublicResultSnapshotRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void saveAll(List<PublicResultSnapshotResponse> snapshots) {
        for (PublicResultSnapshotResponse snapshot : snapshots) {
            save(snapshot);
        }
    }

    @Override
    public Optional<PublicResultSnapshotResponse> findById(String resultSnapshotId) {
        try {
            String payload = jdbcTemplate.queryForObject(
                    "select payload_json from public_result_snapshot where result_snapshot_id = ?",
                    String.class,
                    resultSnapshotId);
            return Optional.of(fromJson(payload));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    @Override
    public List<PublicResultSnapshotResponse> listLatest() {
        List<PublicResultSnapshotResponse> snapshots = jdbcTemplate.query(
                """
                        select payload_json
                        from public_result_snapshot
                        order by fetched_at desc, result_snapshot_id desc
                        """,
                (resultSet, rowNumber) -> fromJson(resultSet.getString("payload_json")));
        String latestFetchedAt = snapshots.stream()
                .filter(snapshot -> parseSequence(snapshot.resultSnapshotId()).isPresent())
                .max(Comparator.comparingLong(snapshot -> parseSequence(snapshot.resultSnapshotId()).orElse(0L)))
                .map(PublicResultSnapshotResponse::fetchedAt)
                .orElseGet(() -> snapshots.stream()
                        .map(PublicResultSnapshotResponse::fetchedAt)
                        .max(String::compareTo)
                        .orElse(null));
        if (latestFetchedAt == null) {
            return List.of();
        }
        return snapshots.stream()
                .filter(snapshot -> latestFetchedAt.equals(snapshot.fetchedAt()))
                .toList();
    }

    @Override
    public long nextSnapshotSequence() {
        List<String> ids = jdbcTemplate.queryForList(
                "select result_snapshot_id from public_result_snapshot where result_snapshot_id like ?",
                String.class,
                SNAPSHOT_PREFIX + "%");
        return ids.stream()
                .map(this::parseSequence)
                .flatMap(Optional::stream)
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L) + 1L;
    }

    private void save(PublicResultSnapshotResponse snapshot) {
        int updatedRows = jdbcTemplate.update("""
                        update public_result_snapshot
                        set match_id = ?,
                            match_date = ?,
                            league = ?,
                            home_team = ?,
                            away_team = ?,
                            kickoff_time = ?,
                            home_score = ?,
                            away_score = ?,
                            result_status = ?,
                            source_name = ?,
                            source_url = ?,
                            source_license = ?,
                            fetched_at = ?,
                            confidence = ?,
                            payload_json = ?
                        where result_snapshot_id = ?
                        """,
                snapshot.matchId(),
                snapshot.matchDate(),
                snapshot.league(),
                snapshot.homeTeam(),
                snapshot.awayTeam(),
                snapshot.kickoffTime(),
                snapshot.homeScore(),
                snapshot.awayScore(),
                snapshot.resultStatus(),
                snapshot.sourceName(),
                snapshot.sourceUrl(),
                snapshot.sourceLicense(),
                snapshot.fetchedAt(),
                snapshot.confidence(),
                toJson(snapshot),
                snapshot.resultSnapshotId());

        if (updatedRows == 0) {
            jdbcTemplate.update("""
                            insert into public_result_snapshot (
                                result_snapshot_id,
                                match_id,
                                match_date,
                                league,
                                home_team,
                                away_team,
                                kickoff_time,
                                home_score,
                                away_score,
                                result_status,
                                source_name,
                                source_url,
                                source_license,
                                fetched_at,
                                confidence,
                                payload_json
                            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                    snapshot.resultSnapshotId(),
                    snapshot.matchId(),
                    snapshot.matchDate(),
                    snapshot.league(),
                    snapshot.homeTeam(),
                    snapshot.awayTeam(),
                    snapshot.kickoffTime(),
                    snapshot.homeScore(),
                    snapshot.awayScore(),
                    snapshot.resultStatus(),
                    snapshot.sourceName(),
                    snapshot.sourceUrl(),
                    snapshot.sourceLicense(),
                    snapshot.fetchedAt(),
                    snapshot.confidence(),
                    toJson(snapshot));
        }
    }

    private Optional<Long> parseSequence(String value) {
        if (value == null || !value.startsWith(SNAPSHOT_PREFIX)) {
            return Optional.empty();
        }
        try {
            return Optional.of(Long.parseLong(value.substring(SNAPSHOT_PREFIX.length())));
        } catch (NumberFormatException ignored) {
            return Optional.empty();
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize public result snapshot payload.", exception);
        }
    }

    private PublicResultSnapshotResponse fromJson(String value) {
        try {
            return objectMapper.readValue(value, PublicResultSnapshotResponse.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize public result snapshot payload.", exception);
        }
    }
}
