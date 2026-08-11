package org.footballlab.review.domain;

public record StrategyRevisionRuleResponse(
        String ruleCode,
        String reasonCode,
        String suggestion) {
}
