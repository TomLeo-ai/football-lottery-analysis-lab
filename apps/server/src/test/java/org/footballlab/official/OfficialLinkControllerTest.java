package org.footballlab.official;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class OfficialLinkControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldReturnOnlyExternalOfficialLinkMetadata() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/official-links"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.msg").value("success"))
                .andExpect(jsonPath("$.data[0].id").value("sporttery-home"))
                .andExpect(jsonPath("$.data[0].url", startsWith("https://")))
                .andExpect(jsonPath("$.data[0].target").value("_blank"))
                .andExpect(jsonPath("$.data[0].rel").value("noopener noreferrer"))
                .andExpect(jsonPath("$.data[0].purpose", containsString("外部链接入口")))
                .andExpect(jsonPath("$.data[0].nonOfficialNotice", containsString("非官方")))
                .andExpect(jsonPath("$.data[0].embeddedContent").doesNotExist())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("<iframe");
        assertThat(body).doesNotContain("webapi.sporttery");
        assertThat(body).doesNotContain("matchList");
        assertThat(body).doesNotContain("oddsList");
    }
}

