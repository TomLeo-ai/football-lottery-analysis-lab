package org.footballlab.resultprovider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;

import com.jayway.jsonpath.JsonPath;
import org.footballlab.resultprovider.repository.PublicResultSnapshotRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class PublicResultProviderControllerTest {

    private static final List<String> BLOCKED_OUTPUT_TERMS = List.of(
            "\u4e2d\u56fd\u7ade\u5f69\u7f51",
            "\u4e2d\u56fd\u4f53\u80b2\u5f69\u7968",
            "\u5b98\u65b9\u5f69\u7968\u722c\u866b",
            "\u7ed5\u8fc7\u9a8c\u8bc1\u7801");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PublicResultSnapshotRepository publicResultSnapshotRepository;

    @Test
    void shouldSyncMockPublicResultsAndExposeProviderStatus() throws Exception {
        MvcResult syncResult = mockMvc.perform(post("/api/result-providers/sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "providerKey": "mock-public-results",
                                  "requestedBy": "stage-6-test"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.providerKey").value("mock-public-results"))
                .andExpect(jsonPath("$.data.providerType").value("MOCK"))
                .andExpect(jsonPath("$.data.syncStatus").value("SYNCED"))
                .andExpect(jsonPath("$.data.snapshotCount").value(1))
                .andExpect(jsonPath("$.data.snapshots[0].sourceName").value("Mock Public Result Provider"))
                .andExpect(jsonPath("$.data.snapshots[0].sourceUrl").value("https://example.com/mock-public-results"))
                .andExpect(jsonPath("$.data.snapshots[0].sourceLicense").value("Fictional sample for local tests only"))
                .andExpect(jsonPath("$.data.snapshots[0].fetchedAt").exists())
                .andExpect(jsonPath("$.data.snapshots[0].confidence").value(0.98))
                .andExpect(jsonPath("$.data.snapshots[0].matchId").value("demo-match-001"))
                .andExpect(jsonPath("$.data.snapshots[0].resultStatus").value("FINISHED"))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("公开赛果源")))
                .andExpect(jsonPath("$.data.complianceNotice", containsString("Mock")))
                .andExpect(jsonPath("$.data.dataPolicy", not(containsString("\u722c\u866b"))))
                .andReturn();

        mockMvc.perform(get("/api/result-providers/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.providerKey").value("mock-public-results"))
                .andExpect(jsonPath("$.data.providerEnabled").value(true))
                .andExpect(jsonPath("$.data.snapshotCount").value(1))
                .andExpect(jsonPath("$.data.snapshots[0].sourceName").value("Mock Public Result Provider"));

        String body = syncResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String resultSnapshotId = JsonPath.read(body, "$.data.snapshots[0].resultSnapshotId");
        assertThat(publicResultSnapshotRepository.findById(resultSnapshotId)).isPresent();

        for (String term : BLOCKED_OUTPUT_TERMS) {
            assertThat(body).doesNotContain(term);
        }
    }
}
