import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOcrWorkflowStore } from '@/stores/ocrWorkflow';

import OcrReviewWizard from './OcrReviewWizard.vue';

describe('OcrReviewWizard', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('confirms reviewed OCR data as USER_SCREENSHOT_CONFIRMED snapshot', async () => {
    const store = useOcrWorkflowStore();
    store.setReviewDraft({
      ocrTaskId: 'ocr-demo-001',
      screenshotTaskId: 'shot-demo-001',
      ocrProvider: 'BROWSER_LOCAL_MOCK',
      status: 'WAITING_USER_CONFIRMATION',
      analysisAllowed: false,
      fields: [
        {
          fieldName: 'league',
          fieldValue: 'Fictional Coastal League',
          confidence: 0.96,
          sourceRegion: 'x=12,y=20,w=180,h=32'
        }
      ]
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 200,
            msg: 'success',
            data: {
              snapshotId: 'snapshot-demo-001',
              sourceType: 'USER_SCREENSHOT_CONFIRMED',
              snapshotStatus: 'CONFIRMED',
              analysisAllowed: true,
              budgetAmount: 20,
              riskPreference: 'BALANCED',
              matches: [
                {
                  homeTeam: 'Northport United',
                  awayTeam: 'Lakeside City'
                }
              ],
              markets: [
                {
                  playType: 'WIN_DRAW_LOSS',
                  selection: 'HOME_WIN',
                  odds: 2.05
                }
              ]
            }
          })
      })
    );

    const wrapper = mount(OcrReviewWizard, {
      global: {
        plugins: [pinia]
      }
    });

    await wrapper.get('button[data-testid="confirm-ocr-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('USER_SCREENSHOT_CONFIRMED');
    expect(wrapper.text()).toContain('CONFIRMED');
    expect(wrapper.text()).toContain('现在允许进入 AI 分析');
  });
});
