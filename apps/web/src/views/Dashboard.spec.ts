import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import { useAnalysisReportStore } from '@/stores/analysisReport';
import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';
import { useSimulatedPlanStore } from '@/stores/simulatedPlan';

import Dashboard from './Dashboard.vue';

const WORKFLOW_ID = 'workflow-550e8400-e29b-41d4-a716-446655440001';

describe('Dashboard authoritative cold recovery', () => {
  it('shows workflow report and plan IDs even when entity caches are empty', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useOcrWorkflowStore().$patch({
      status: 'READY',
      activeWorkflowId: WORKFLOW_ID,
      workflow: {
        workflowId: WORKFLOW_ID,
        currentStage: 'PENDING_RESULT',
        version: 6,
        screenshotTaskId: 'screenshot-001',
        currentOcrTaskId: 'ocr-tombstone-reference',
        confirmedSnapshotId: 'snapshot-001',
        currentReportId: 'analysis-cold-001',
        currentPlanId: 'sim-plan-cold-001',
        createdAt: '2026-08-24T00:00:00Z',
        updatedAt: '2026-08-24T00:10:00Z',
      },
    });
    expect(Object.keys(useAnalysisReportStore().reportsById)).toHaveLength(0);
    expect(Object.keys(useSimulatedPlanStore().plansById)).toHaveLength(0);

    const wrapper = mount(Dashboard, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    });

    expect(wrapper.text()).toContain('analysis-cold-001');
    expect(wrapper.text()).toContain('sim-plan-cold-001');
    expect(wrapper.text()).toContain('PENDING_RESULT');
    expect(wrapper.text()).not.toContain('WAITING_CONFIRMED_SNAPSHOT');
    expect(wrapper.text()).not.toContain('WAITING_ANALYSIS_REPORT');
  });
});
