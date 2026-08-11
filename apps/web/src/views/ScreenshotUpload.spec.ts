import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ScreenshotUpload from './ScreenshotUpload.vue';

describe('ScreenshotUpload', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('creates a screenshot task and keeps OCR output waiting for manual confirmation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                taskId: 'shot-demo-001',
                status: 'WAITING_LOCAL_OCR',
                serverOcrEnabled: false,
                sampleLabel: 'DEMO DATA / FICTIONAL SAMPLE',
                privacyPolicy: '截图 OCR 结果不作为公共官方数据源。'
              }
            })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              msg: 'success',
              data: {
                ocrTaskId: 'ocr-demo-001',
                screenshotTaskId: 'shot-demo-001',
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
              }
            })
        })
    );

    const wrapper = mount(ScreenshotUpload, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>'
          }
        }
      }
    });

    await wrapper.get('button[data-testid="demo-ocr-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('WAITING_USER_CONFIRMATION');
    expect(wrapper.text()).toContain('未经人工确认，OCR 数据不会进入 AI 分析');
    expect(wrapper.text()).toContain('DEMO DATA / FICTIONAL SAMPLE');
  });
});

