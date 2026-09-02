<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), {
  compact: false,
});
</script>

<template>
  <aside
    class="trial-notice"
    :class="{ 'trial-notice--compact': compact }"
    role="note"
    data-testid="public-trial-notice"
    aria-label="公开试用版数据提醒"
  >
    <div>
      <strong>公开试用版 · 数据不会长期保存</strong>
      <p v-if="compact">
        试用数据可能在服务休眠、重启、重新部署或升级后清空，请勿保存重要信息。
      </p>
      <p v-else>
        首次访问可能需要约 1 分钟启动。服务休眠、重启或升级后，草稿、方案及复盘数据可能被清空，
        请勿依赖本站保存重要数据。请勿上传敏感信息或无权使用的图片。
      </p>
    </div>
    <nav v-if="!compact" class="trial-notice__actions" aria-label="试用版相关入口">
      <RouterLink to="/about-compliance">数据与合规说明</RouterLink>
      <a
        href="https://github.com/TomLeo-ai/football-lottery-analysis-lab/issues"
        target="_blank"
        rel="noopener noreferrer"
      >
        反馈问题 / 参与维护
      </a>
    </nav>
  </aside>
</template>
