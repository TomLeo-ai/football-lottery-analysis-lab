<template>
  <section class="workflow-page" aria-labelledby="about-compliance-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">AboutCompliance</p>
        <h2 id="about-compliance-title">合规说明</h2>
      </div>
      <p class="page-heading__notice">非官方 · 仅技术研究 · 仅模拟复盘</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>项目声明</strong>
      <p>
        Football Lottery Analysis Lab 是非官方开源实验项目，页面和接口只服务虚构样例、
        本地 OCR 确认、Mock 分析、模拟方案保存和赛后复盘。
      </p>
    </div>

    <div class="workflow-grid">
      <section class="tool-panel" aria-labelledby="allowed-title">
        <h3 id="allowed-title">允许范围</h3>
        <ul class="check-list">
          <li>官方信息只作为外链入口存在。</li>
          <li>赛前输入来自用户上传截图和人工确认。</li>
          <li>示例数据必须显著标注 DEMO DATA / FICTIONAL SAMPLE。</li>
          <li>复盘只使用 Mock 或合规公开体育比分源抽象。</li>
        </ul>
      </section>

      <section class="tool-panel" aria-labelledby="blocked-title">
        <h3 id="blocked-title">禁止范围</h3>
        <ul class="check-list">
          <li>不实现真实购彩、支付、出票、代购、合买、跟单、充值、提现。</li>
          <li>不抓取、不缓存、不镜像官方彩票页面数据。</li>
          <li>不提交官方截图、Logo、页面复制素材或真实官方批量数据。</li>
          <li>不输出确定性建议，不承诺中奖率、收益或结果。</li>
        </ul>
      </section>
    </div>

    <section class="tool-panel" aria-labelledby="docs-title">
      <h3 id="docs-title">文档检查点</h3>
      <dl class="meta-list">
        <div>
          <dt>合规边界</dt>
          <dd>docs/compliance.md</dd>
        </div>
        <div>
          <dt>官方外链</dt>
          <dd>docs/official-links.md</dd>
        </div>
        <div>
          <dt>赛果源</dt>
          <dd>docs/public-result-provider.md</dd>
        </div>
        <div>
          <dt>复盘规则</dt>
          <dd>docs/review-optimization.md</dd>
        </div>
      </dl>
    </section>
  </section>
</template>
