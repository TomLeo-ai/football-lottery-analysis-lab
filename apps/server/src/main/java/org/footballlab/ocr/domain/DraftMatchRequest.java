package org.footballlab.ocr.domain;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import org.footballlab.common.json.StrictRequestFields;

public final class DraftMatchRequest {

    private String matchId;
    private String matchDate;
    private String league;
    private String homeTeam;
    private String awayTeam;
    private String kickoffTime;

    public String getMatchId() {
        return matchId;
    }

    public void setMatchId(String matchId) {
        this.matchId = matchId;
    }

    public String getMatchDate() {
        return matchDate;
    }

    public void setMatchDate(String matchDate) {
        this.matchDate = matchDate;
    }

    public String getLeague() {
        return league;
    }

    public void setLeague(String league) {
        this.league = league;
    }

    public String getHomeTeam() {
        return homeTeam;
    }

    public void setHomeTeam(String homeTeam) {
        this.homeTeam = homeTeam;
    }

    public String getAwayTeam() {
        return awayTeam;
    }

    public void setAwayTeam(String awayTeam) {
        this.awayTeam = awayTeam;
    }

    public String getKickoffTime() {
        return kickoffTime;
    }

    public void setKickoffTime(String kickoffTime) {
        this.kickoffTime = kickoffTime;
    }

    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        StrictRequestFields.reject(name);
    }
}
