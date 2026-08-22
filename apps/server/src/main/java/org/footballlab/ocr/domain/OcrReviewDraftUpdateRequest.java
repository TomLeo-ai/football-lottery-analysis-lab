package org.footballlab.ocr.domain;

import java.math.BigDecimal;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.json.StrictRequestFields;

public final class OcrReviewDraftUpdateRequest {

    private long expectedRevision;
    private String riskPreference;
    private BigDecimal budgetAmount;
    private String currency;
    private List<DraftMatchRequest> matches = List.of();
    private List<DraftMarketRequest> markets = List.of();

    public long getExpectedRevision() {
        return expectedRevision;
    }

    public void setExpectedRevision(long expectedRevision) {
        this.expectedRevision = expectedRevision;
    }

    public String getRiskPreference() {
        return riskPreference;
    }

    public void setRiskPreference(String riskPreference) {
        this.riskPreference = riskPreference;
    }

    public BigDecimal getBudgetAmount() {
        return budgetAmount;
    }

    public void setBudgetAmount(BigDecimal budgetAmount) {
        this.budgetAmount = budgetAmount;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public List<DraftMatchRequest> getMatches() {
        return matches;
    }

    public void setMatches(List<DraftMatchRequest> matches) {
        this.matches = matches == null ? List.of() : List.copyOf(matches);
    }

    public List<DraftMarketRequest> getMarkets() {
        return markets;
    }

    public void setMarkets(List<DraftMarketRequest> markets) {
        this.markets = markets == null ? List.of() : List.copyOf(markets);
    }

    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        StrictRequestFields.reject(name);
    }
}
