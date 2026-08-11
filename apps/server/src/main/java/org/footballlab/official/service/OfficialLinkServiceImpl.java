package org.footballlab.official.service;

import java.util.List;

import org.footballlab.official.domain.OfficialLinkResponse;
import org.springframework.stereotype.Service;

@Service
public class OfficialLinkServiceImpl implements OfficialLinkService {

    private static final String LINK_TARGET = "_blank";
    private static final String LINK_REL = "noopener noreferrer";
    private static final String NON_OFFICIAL_NOTICE = "本项目非官方，仅提供外部链接入口；仅供技术研究和模拟复盘，不构成购彩建议。";
    private static final String DATA_POLICY = "只保存链接元数据；不抓取、不缓存、不镜像、不展示官方页面具体赛事、赔率、玩法、赛果或开奖数据。";
    private static final String UPDATED_AT = "2026-06-25T00:00:00+08:00";

    @Override
    public List<OfficialLinkResponse> listOfficialLinks() {
        return List.of(
                new OfficialLinkResponse(
                        "sporttery-home",
                        "竞彩网官方信息入口",
                        "https://www.sporttery.cn/?pc=1",
                        "外部链接入口，用于用户自行访问官方信息页面；本项目不复制页面数据。",
                        "CN",
                        LINK_TARGET,
                        LINK_REL,
                        NON_OFFICIAL_NOTICE,
                        DATA_POLICY,
                        UPDATED_AT),
                new OfficialLinkResponse(
                        "china-sports-lottery",
                        "中国体彩网官方信息入口",
                        "https://www.lottery.gov.cn/",
                        "外部链接入口，用于用户自行访问官方信息页面；本项目不复制页面数据。",
                        "CN",
                        LINK_TARGET,
                        LINK_REL,
                        NON_OFFICIAL_NOTICE,
                        DATA_POLICY,
                        UPDATED_AT));
    }
}

