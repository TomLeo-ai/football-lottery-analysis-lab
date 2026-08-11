package org.footballlab.resultprovider;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.footballlab.resultprovider.domain.PublicResultSnapshotResponse;
import org.footballlab.resultprovider.repository.JdbcPublicResultSnapshotRepository;
import org.footballlab.resultprovider.repository.PublicResultSnapshotRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class PublicResultSnapshotRepositoryTest {

    @Autowired
    private PublicResultSnapshotRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldReadSavedPublicResultSnapshotAfterRepositoryRestart() {
        String suffix = UUID.randomUUID().toString();
        PublicResultSnapshotResponse snapshot = new PublicResultSnapshotResponse(
                "result-snapshot-restart-" + suffix,
                "match-restart-" + suffix,
                "2001-07-01",
                "Fictional Restart League",
                "Restart Home",
                "Restart Away",
                "2001-07-01T19:30:00+08:00",
                3,
                1,
                "FINISHED",
                "Mock Public Result Provider",
                "https://example.com/mock-public-results",
                "Fictional sample for local tests only",
                "2001-07-01T20:45:00+08:00",
                BigDecimal.valueOf(0.98));

        repository.saveAll(List.of(snapshot));

        PublicResultSnapshotRepository restartedRepository =
                new JdbcPublicResultSnapshotRepository(jdbcTemplate, objectMapper);

        assertThat(restartedRepository.findById(snapshot.resultSnapshotId()))
                .contains(snapshot);
        assertThat(restartedRepository.nextSnapshotSequence()).isGreaterThanOrEqualTo(1L);
    }
}
