<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';

const route = useRoute();
const workflowStore = useOcrWorkflowStore();

const workflowId = computed(() => {
  const value = route.params.workflowId;
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
});

const allowedStages = computed(() => {
  const value = route.meta.allowedStages;
  return Array.isArray(value) ? value.map(String) : [];
});

const routeReady = computed(() => (
  workflowStore.status === 'READY'
  && workflowStore.activeWorkflowId === workflowId.value
  && workflowStore.workflow?.workflowId === workflowId.value
));

const routeAllowed = computed(() => {
  const workflow = workflowStore.workflow;
  return routeReady.value
    && workflow !== null
    && (
      allowedStages.value.length === 0
      || allowedStages.value.includes(workflow.currentStage)
    );
});

async function hydrateCurrentRoute(): Promise<void> {
  try {
    await workflowStore.hydrateWorkflow(workflowId.value);
  } catch {
    // The store owns the visible error state.
  }
}

onMounted(() => {
  void hydrateCurrentRoute();
});

watch(workflowId, () => {
  void hydrateCurrentRoute();
});
</script>

<template>
  <section
    v-if="workflowStore.status === 'LOADING' || (workflowStore.status !== 'ERROR' && !routeReady)"
    class="workflow-page"
    aria-live="polite"
  >
    <div class="state-panel">
      <span class="state-panel__spinner" aria-hidden="true"></span>
      <p>正在加载指定工作流：{{ workflowId }}</p>
    </div>
  </section>

  <section v-else-if="workflowStore.status === 'ERROR'" class="workflow-page" role="alert">
    <div class="state-panel state-panel--error">
      <div>
        <strong>无法恢复此工作流</strong>
        <p>{{ workflowStore.errorMessage ?? '请从截图 OCR 重新开始。' }}</p>
      </div>
      <RouterLink class="external-link" to="/screenshot-upload">返回截图 OCR</RouterLink>
    </div>
  </section>

  <section v-else-if="workflowStore.status === 'READY' && !routeAllowed" class="workflow-page" role="status">
    <div class="state-panel">
      <div>
        <strong>当前阶段不能打开此步骤</strong>
        <p>
          当前工作流阶段是 {{ workflowStore.workflow?.currentStage }}，
          请从允许的步骤继续，避免跨阶段或跨工作流读取。
        </p>
      </div>
      <RouterLink class="external-link" to="/dashboard">返回仪表盘</RouterLink>
    </div>
  </section>

  <RouterView v-else />
</template>
