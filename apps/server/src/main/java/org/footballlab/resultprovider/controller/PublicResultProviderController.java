package org.footballlab.resultprovider.controller;

import org.footballlab.common.Result;
import org.footballlab.resultprovider.domain.PublicResultProviderStatusResponse;
import org.footballlab.resultprovider.domain.PublicResultProviderSyncRequest;
import org.footballlab.resultprovider.service.PublicResultProviderService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/result-providers")
public class PublicResultProviderController {

    private final PublicResultProviderService publicResultProviderService;

    public PublicResultProviderController(PublicResultProviderService publicResultProviderService) {
        this.publicResultProviderService = publicResultProviderService;
    }

    @PostMapping("/sync")
    public Result<PublicResultProviderStatusResponse> sync(@RequestBody PublicResultProviderSyncRequest request) {
        return Result.success(publicResultProviderService.sync(request));
    }

    @GetMapping("/status")
    public Result<PublicResultProviderStatusResponse> status() {
        return Result.success(publicResultProviderService.status());
    }
}
