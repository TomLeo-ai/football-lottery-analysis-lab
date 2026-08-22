import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SourceDeclarationPanel from './SourceDeclarationPanel.vue';
import sourceDeclarationPanelSource from './SourceDeclarationPanel.vue?raw';

const PRIVACY_STATEMENT =
  '图片仅在当前浏览器内处理。服务端不会接收原图、完整 OCR 文本或逐词结果；结构化候选字段会保存到本机后端供您刷新恢复，只有您确认后的快照才能进入模拟分析。';

const EMPTY_ACKNOWLEDGEMENTS = {
  sensitiveData: false,
  officialMaterial: false,
  humanConfirmation: false,
};

describe('SourceDeclarationPanel', () => {
  it('starts without a source choice and renders the complete privacy statement', () => {
    const wrapper = mount(SourceDeclarationPanel, {
      props: {
        modelValue: null,
        acknowledgements: EMPTY_ACKNOWLEDGEMENTS,
      },
    });

    const sourceOptions = wrapper.findAll<HTMLInputElement>('input[type="radio"]');
    expect(sourceOptions).toHaveLength(2);
    expect(sourceOptions.every((option) => option.element.checked === false)).toBe(true);
    expect(wrapper.text()).toContain(PRIVACY_STATEMENT);
    expect(wrapper.get('[aria-live="polite"]').text()).toContain('请先声明图片来源');
  });

  it('requires all three acknowledgements for an authorized user image', async () => {
    const wrapper = mount(SourceDeclarationPanel, {
      props: {
        modelValue: 'USER_OWNED_AUTHORIZED',
        acknowledgements: EMPTY_ACKNOWLEDGEMENTS,
      },
    });

    const acknowledgements = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]');
    expect(acknowledgements).toHaveLength(3);
    expect(wrapper.text()).toContain('不含 API Key、Token、Cookie、支付信息或不必要的私人身份信息');
    expect(wrapper.text()).toContain('不是需要复制、公开或再发布的官方彩票网站截图、Logo 或官方数据集');
    expect(wrapper.text()).toContain('只有人工确认的结构化字段进入后续模拟分析');
    expect(wrapper.get('[aria-live="polite"]').text()).toContain('请完成全部三项确认');

    await acknowledgements[0].setValue(true);
    expect(wrapper.emitted('update:acknowledgements')?.[0]).toEqual([
      {
        sensitiveData: true,
        officialMaterial: false,
        humanConfirmation: false,
      },
    ]);

    await wrapper.setProps({
      acknowledgements: {
        sensitiveData: true,
        officialMaterial: true,
        humanConfirmation: true,
      },
    });
    expect(wrapper.get('[aria-live="polite"]').text()).toContain('来源声明已完成');
  });

  it('emits source changes and clears acknowledgements when leaving the user-owned source', async () => {
    const wrapper = mount(SourceDeclarationPanel, {
      props: {
        modelValue: 'USER_OWNED_AUTHORIZED',
        acknowledgements: {
          sensitiveData: true,
          officialMaterial: true,
          humanConfirmation: true,
        },
      },
    });

    await wrapper.get<HTMLInputElement>('input[value="FICTIONAL_SAMPLE"]').setValue();

    expect(wrapper.emitted('update:modelValue')).toEqual([['FICTIONAL_SAMPLE']]);
    expect(wrapper.emitted('update:acknowledgements')).toEqual([[EMPTY_ACKNOWLEDGEMENTS]]);
  });

  it('keeps the public component boundary free of sensitive browser objects and app services', () => {
    expect(sourceDeclarationPanelSource).not.toMatch(/@\/(?:api|stores)\//);
    expect(sourceDeclarationPanelSource).not.toMatch(
      /\b(?:File|Blob|HTMLCanvasElement|CanvasRenderingContext2D|rawOcr|rawText)\b/,
    );
    expect(sourceDeclarationPanelSource).not.toMatch(
      /\b(?:fetch|localStorage|sessionStorage|console\.)/,
    );
  });
});
