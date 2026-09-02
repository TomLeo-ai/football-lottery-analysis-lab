package org.footballlab.system.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaForwardController {

    private static final String INDEX_FORWARD = "forward:/index.html";

    @GetMapping({
            "/dashboard",
            "/official-source-hub",
            "/screenshot-upload",
            "/ocr-review",
            "/match-workspace",
            "/strategy-simulator",
            "/saved-plans",
            "/review-center",
            "/strategy-lab",
            "/model-settings",
            "/about-compliance",
            "/workflows/{workflowId}",
            "/workflows/{workflowId}/ocr",
            "/workflows/{workflowId}/ocr-review",
            "/workflows/{workflowId}/match-workspace",
            "/workflows/{workflowId}/analysis",
            "/workflows/{workflowId}/plans",
            "/workflows/{workflowId}/plans/{planId}"
    })
    public String forwardToIndex() {
        return INDEX_FORWARD;
    }
}
