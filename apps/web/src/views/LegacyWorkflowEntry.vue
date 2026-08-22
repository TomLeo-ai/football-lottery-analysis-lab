<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter, type RouteRecordName } from 'vue-router';

import { readWorkflowId } from '@/workflow/workflowSession';

const props = defineProps<{
  readonly targetName: RouteRecordName;
  readonly title: string;
}>();

const router = useRouter();
const sessionChecked = ref(false);

onMounted(async () => {
  const workflowId = readWorkflowId();
  if (workflowId !== null) {
    await router.replace({
      name: props.targetName,
      params: { workflowId },
    });
    return;
  }
  sessionChecked.value = true;
});
</script>

<template>
  <section class="workflow-page" aria-labelledby="legacy-workflow-entry-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">WorkflowEntry</p>
        <h2 id="legacy-workflow-entry-title">{{ title }}</h2>
      </div>
      <p class="page-heading__notice">需要明确 workflow URL · 不读取“最新”任务</p>
    </div>

    <div v-if="!sessionChecked" class="state-panel" aria-live="polite">
      <span class="state-panel__spinner" aria-hidden="true"></span>
      <p>正在检查当前标签页的工作流会话。</p>
    </div>

    <div v-else class="state-panel" role="status">
      <div>
        <strong>当前标签页没有可恢复的工作流</strong>
        <p>请从截图 OCR 创建工作流，或打开形如 /workflows/&lt;workflowId&gt;/ocr-review 的明确链接。</p>
      </div>
      <RouterLink class="external-link" to="/screenshot-upload">返回截图 OCR</RouterLink>
    </div>
  </section>
</template>
