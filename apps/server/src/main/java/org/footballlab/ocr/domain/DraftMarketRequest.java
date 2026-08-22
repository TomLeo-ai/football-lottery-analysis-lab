package org.footballlab.ocr.domain;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.json.StrictRequestFields;

public final class DraftMarketRequest {

    private String marketId;
    private String matchId;
    private String playType;
    private String selection;
    private BigDecimal odds;

    public String getMarketId() {
        return marketId;
    }

    public void setMarketId(String marketId) {
        this.marketId = marketId;
    }

    public String getMatchId() {
        return matchId;
    }

    public void setMatchId(String matchId) {
        this.matchId = matchId;
    }

    public String getPlayType() {
        return playType;
    }

    public void setPlayType(String playType) {
        this.playType = playType;
    }

    public String getSelection() {
        return selection;
    }

    public void setSelection(String selection) {
        this.selection = selection;
    }

    public BigDecimal getOdds() {
        return odds;
    }

    public void setOdds(BigDecimal odds) {
        this.odds = odds;
    }

    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        StrictRequestFields.reject(name);
    }
}
