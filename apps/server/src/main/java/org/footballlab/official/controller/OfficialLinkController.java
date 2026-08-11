package org.footballlab.official.controller;

import java.util.List;

import org.footballlab.common.Result;
import org.footballlab.official.domain.OfficialLinkResponse;
import org.footballlab.official.service.OfficialLinkService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/official-links")
public class OfficialLinkController {

    private final OfficialLinkService officialLinkService;

    public OfficialLinkController(OfficialLinkService officialLinkService) {
        this.officialLinkService = officialLinkService;
    }

    @GetMapping
    public Result<List<OfficialLinkResponse>> listOfficialLinks() {
        return Result.success(officialLinkService.listOfficialLinks());
    }
}

