package org.footballlab.system.controller;

import org.footballlab.common.Result;
import org.footballlab.system.domain.BuildInfoResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.info.BuildProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system")
public class SystemInfoController {

    private final BuildInfoResponse buildInfo;

    public SystemInfoController(
            BuildProperties buildProperties,
            @Value("${app.verification.run-id:#{null}}") String verificationRunId) {
        this.buildInfo = new BuildInfoResponse(
                buildProperties.getArtifact(),
                buildProperties.getVersion(),
                verificationRunId);
    }

    @GetMapping("/build-info")
    public Result<BuildInfoResponse> getBuildInfo() {
        return Result.success(buildInfo);
    }
}
