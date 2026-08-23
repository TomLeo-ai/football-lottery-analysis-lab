package org.footballlab.system;

import static org.hamcrest.Matchers.aMapWithSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Properties;

import org.footballlab.system.controller.SystemInfoController;
import org.junit.jupiter.api.Test;
import org.springframework.boot.info.BuildProperties;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.test.context.support.TestPropertySourceUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class SystemInfoControllerTest {

    private static final String ARTIFACT = "football-lottery-analysis-server";
    private static final String VERSION = "0.1.0-SNAPSHOT";
    private static final String VERIFICATION_RUN_ID = "8d5b532e-7596-4b2d-a268-4bea468311c8";

    @Test
    void shouldReturnConfiguredVerificationRunId() throws Exception {
        try (AnnotationConfigApplicationContext context = createContext(VERIFICATION_RUN_ID)) {
            mockMvc(context).perform(get("/api/system/build-info"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(200))
                    .andExpect(jsonPath("$.msg").value("success"))
                    .andExpect(jsonPath("$.data", aMapWithSize(3)))
                    .andExpect(jsonPath("$.data.artifact").value(ARTIFACT))
                    .andExpect(jsonPath("$.data.version").value(VERSION))
                    .andExpect(jsonPath("$.data.verificationRunId").value(VERIFICATION_RUN_ID));
        }
    }

    @Test
    void shouldReturnJsonNullWhenVerificationRunIdIsNotConfigured() throws Exception {
        try (AnnotationConfigApplicationContext context = createContext(null)) {
            mockMvc(context).perform(get("/api/system/build-info"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data", aMapWithSize(3)))
                    .andExpect(jsonPath("$.data.artifact").value(ARTIFACT))
                    .andExpect(jsonPath("$.data.version").value(VERSION))
                    .andExpect(jsonPath("$.data.verificationRunId").value(nullValue()));
        }
    }

    private AnnotationConfigApplicationContext createContext(String verificationRunId) {
        AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
        if (verificationRunId != null) {
            TestPropertySourceUtils.addInlinedPropertiesToEnvironment(
                    context,
                    "app.verification.run-id=" + verificationRunId);
        }
        context.registerBean(BuildProperties.class, this::buildProperties);
        context.register(SystemInfoController.class);
        context.refresh();
        return context;
    }

    private BuildProperties buildProperties() {
        Properties properties = new Properties();
        properties.setProperty("artifact", ARTIFACT);
        properties.setProperty("version", VERSION);
        return new BuildProperties(properties);
    }

    private MockMvc mockMvc(AnnotationConfigApplicationContext context) {
        return MockMvcBuilders.standaloneSetup(context.getBean(SystemInfoController.class)).build();
    }
}
