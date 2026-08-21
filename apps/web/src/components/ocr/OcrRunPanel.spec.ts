import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import OcrRunPanel from './OcrRunPanel.vue';
import ocrRunPanelSource from './OcrRunPanel.vue?raw';

describe('OcrRunPanel', () => {
  it('clamps progress and describes active adapter stages without failing on invalid progress', async () => {
    const wrapper = mount(OcrRunPanel, {
      props: {
        stage: 'RECOGNIZING',
        progress: 150,
        meanConfidence: null,
        canCancel: true,
      },
    });

    const progress = wrapper.get<HTMLProgressElement>('progress');
    expect(progress.attributes('aria-label')).toBe('OCR 处理进度');
    expect(progress.element.value).toBe(100);
    expect(wrapper.text()).toContain('正在识别图片文字');

    await wrapper.setProps({ stage: 'MAPPING', progress: Number.NaN });
    expect(progress.element.value).toBe(0);
    expect(wrapper.text()).toContain('正在映射结构化候选字段');
  });

  it('emits separate start, cancel, retry, and manual-entry commands with stage-aware disabling', async () => {
    const wrapper = mount(OcrRunPanel, {
      props: {
        stage: 'IDLE',
        progress: 0,
        meanConfidence: null,
        canRetry: false,
        canCancel: false,
      },
    });

    await wrapper.get('[data-testid="start-ocr"]').trigger('click');
    await wrapper.get('[data-testid="manual-entry"]').trigger('click');
    expect(wrapper.emitted('start')).toEqual([[]]);
    expect(wrapper.emitted('manual-entry')).toEqual([[]]);

    await wrapper.setProps({ stage: 'RECOGNIZING', canCancel: true });
    expect(wrapper.get<HTMLButtonElement>('[data-testid="start-ocr"]').element.disabled).toBe(true);
    expect(wrapper.get<HTMLButtonElement>('[data-testid="manual-entry"]').element.disabled).toBe(true);
    await wrapper.get('[data-testid="cancel-ocr"]').trigger('click');
    expect(wrapper.emitted('cancel')).toEqual([[]]);

    await wrapper.setProps({ stage: 'ERROR', canCancel: false, canRetry: true });
    await wrapper.get('[data-testid="retry-ocr"]').trigger('click');
    expect(wrapper.emitted('retry')).toEqual([[]]);
  });

  it('uses review wording for low confidence without claiming the data is wrong', () => {
    const wrapper = mount(OcrRunPanel, {
      props: {
        stage: 'SUCCESS',
        progress: 100,
        meanConfidence: 0.59,
      },
    });

    expect(wrapper.text()).toContain('识别置信度较低，请人工核对');
    expect(wrapper.text()).not.toContain('识别错误');
    expect(wrapper.text()).not.toContain('错误数据');
  });

  it('announces errors and cache warnings independently', () => {
    const wrapper = mount(OcrRunPanel, {
      props: {
        stage: 'ERROR',
        progress: 36,
        meanConfidence: 0.8,
        cacheWarning: '本机缓存暂不可用，当前结果仍可继续核对。',
        canRetry: true,
      },
    });

    expect(wrapper.get('[role="alert"]').text()).toContain('识别未完成');
    expect(wrapper.get('[data-testid="cache-warning"]').attributes('role')).toBe('status');
    expect(wrapper.get('[data-testid="cache-warning"]').text()).toContain('本机缓存暂不可用');
    expect(wrapper.text()).toContain('平均置信度 80%');
    expect(wrapper.text()).not.toContain('识别置信度较低');
  });

  it('has no API, store, controller, storage, or sensitive browser-object dependency', () => {
    expect(ocrRunPanelSource).not.toMatch(/@\/(?:api|stores|ocr)\//);
    expect(ocrRunPanelSource).not.toMatch(
      /\b(?:File|Blob|HTMLCanvasElement|CanvasRenderingContext2D|rawOcr|rawText)\b/,
    );
    expect(ocrRunPanelSource).not.toMatch(
      /\b(?:fetch|localStorage|sessionStorage|console\.)/,
    );
  });
});
