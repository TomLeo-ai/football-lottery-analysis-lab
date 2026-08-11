<script setup lang="ts">
const revisionRules = [
  {
    ruleCode: 'REVIEW_DIRECTION_WEIGHT',
    reasonCode: 'DIRECTION_ERROR',
    scope: '方向判断权重',
    action: '降低单一方向信号依赖，下一版策略要求更多交叉证据。'
  },
  {
    ruleCode: 'REVIEW_PLAY_TYPE_FILTER',
    reasonCode: 'PLAY_TYPE_ERROR',
    scope: '玩法过滤',
    action: '进入模拟前校验玩法类型，避免复盘时无法按规则解释。'
  },
  {
    ruleCode: 'REVIEW_RESULT_MATCHING',
    reasonCode: 'RESULT_MATCHING_ERROR',
    scope: '赛果匹配',
    action: '提高比赛日期、联赛、队名和开赛时间的完整性。'
  }
];
</script>

<template>
  <section class="workflow-page" aria-labelledby="strategy-lab-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">StrategyLab</p>
        <h2 id="strategy-lab-title">策略实验室</h2>
      </div>
      <p class="page-heading__notice">只读复盘规则 · 不做确定性承诺</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>实验室边界</strong>
      <p>
        策略实验室只展示复盘归因后的规则方向，用于技术研究和模拟复盘。
        这里不提供确定性建议，也不提供任何真实操作入口。
      </p>
    </div>

    <section class="tool-panel" aria-labelledby="revision-rule-title">
      <h3 id="revision-rule-title">修正规则库</h3>
      <div class="link-table-wrap">
        <table class="link-table workflow-table">
          <caption>
            Stage 7 已实现的策略修正规则。
          </caption>
          <thead>
            <tr>
              <th scope="col">规则</th>
              <th scope="col">失败原因</th>
              <th scope="col">范围</th>
              <th scope="col">修正动作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rule in revisionRules" :key="rule.ruleCode">
              <td>{{ rule.ruleCode }}</td>
              <td>{{ rule.reasonCode }}</td>
              <td>{{ rule.scope }}</td>
              <td>{{ rule.action }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
