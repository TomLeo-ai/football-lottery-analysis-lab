import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import type { ImageWorkspaceSnapshot } from '@/ocr/imageWorkspace';

import ImageWorkspace from './ImageWorkspace.vue';
import imageWorkspaceSource from './ImageWorkspace.vue?raw';

const WORKSPACE: ImageWorkspaceSnapshot = {
  previewUrl: 'blob:local-ocr-preview',
  normalizedWidth: 1200,
  normalizedHeight: 800,
  rotation: 90,
  crop: null,
  redactions: [{ x: 25, y: 30, width: 120, height: 60 }],
};

describe('ImageWorkspace', () => {
  it('renders an accessible local preview and serializable workspace summary', () => {
    const wrapper = mount(ImageWorkspace, { props: { workspace: WORKSPACE } });

    const image = wrapper.get<HTMLImageElement>('img');
    expect(image.attributes('src')).toBe(WORKSPACE.previewUrl);
    expect(image.attributes('alt')).toBe('待处理的本地 OCR 图片预览');
    expect(wrapper.text()).toContain('1200 × 800');
    expect(wrapper.text()).toContain('90°');
    expect(wrapper.text()).toContain('未设置');
    expect(wrapper.text()).toContain('1 处');
  });

  it.each([
    ['HTTPS URL', 'https://example.test/ocr.png'],
    ['HTTP URL', 'http://example.test/ocr.png'],
    ['data URL', 'data:image/png;base64,AA=='],
    ['JavaScript URL', 'javascript:alert(1)'],
    ['file URL', 'file:///tmp/ocr.png'],
    ['protocol-relative URL', '//example.test/ocr.png'],
    ['empty URL', ''],
    ['malformed URL', 'not a url'],
    ['empty blob URL', 'blob:'],
  ])('refuses an unsafe %s without rendering an image source', (_label, previewUrl) => {
    const wrapper = mount(ImageWorkspace, {
      props: { workspace: { ...WORKSPACE, previewUrl } },
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('[data-testid="invalid-preview"]').attributes('role')).toBe('alert');
    expect(wrapper.get('[data-testid="invalid-preview"]').text()).toContain(
      '无法显示本地图片预览',
    );
    expect(wrapper.emitted()).toEqual({});
  });

  it('handles an exceptional preview URL getter without rendering or emitting', () => {
    const workspace = { ...WORKSPACE };
    Object.defineProperty(workspace, 'previewUrl', {
      enumerable: true,
      get() {
        throw new Error('preview URL unavailable');
      },
    });

    const HostComponent = defineComponent({
      setup: () => () => h(ImageWorkspace, { workspace }),
    });
    const wrapper = mount(HostComponent);

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('[data-testid="invalid-preview"]').attributes('role')).toBe('alert');
    expect(wrapper.emitted()).toEqual({});
  });

  it('uses native buttons to emit distinct rotation and redaction removal commands', async () => {
    const wrapper = mount(ImageWorkspace, { props: { workspace: WORKSPACE } });
    const leftButton = wrapper.get<HTMLButtonElement>('[data-testid="rotate-left"]');
    const rightButton = wrapper.get<HTMLButtonElement>('[data-testid="rotate-right"]');

    expect(leftButton.element.tagName).toBe('BUTTON');
    expect(rightButton.element.tagName).toBe('BUTTON');
    await leftButton.trigger('click');
    await rightButton.trigger('click');
    await wrapper.get<HTMLButtonElement>('[data-testid="remove-redaction-0"]').trigger('click');
    await wrapper.get<HTMLButtonElement>('[data-testid="clear-redactions"]').trigger('click');

    expect(wrapper.emitted('rotate')).toEqual([['LEFT'], ['RIGHT']]);
    expect(wrapper.emitted('remove-redaction')).toEqual([[0]]);
    expect(wrapper.emitted('clear-redactions')).toEqual([[]]);
  });

  it('emits finite numeric crop and redaction rectangles from labeled inputs', async () => {
    const wrapper = mount(ImageWorkspace, { props: { workspace: WORKSPACE } });

    await wrapper.get('#ocr-crop-x').setValue('10');
    await wrapper.get('#ocr-crop-y').setValue('20');
    await wrapper.get('#ocr-crop-width').setValue('300');
    await wrapper.get('#ocr-crop-height').setValue('200');
    await wrapper.get('[data-testid="apply-crop"]').trigger('click');
    await wrapper.get('[data-testid="clear-crop"]').trigger('click');

    await wrapper.get('#ocr-redaction-x').setValue('15');
    await wrapper.get('#ocr-redaction-y').setValue('25');
    await wrapper.get('#ocr-redaction-width').setValue('80');
    await wrapper.get('#ocr-redaction-height').setValue('40');
    await wrapper.get('[data-testid="add-redaction"]').trigger('click');

    expect(wrapper.emitted('set-crop')).toEqual([
      [{ x: 10, y: 20, width: 300, height: 200 }],
      [null],
    ]);
    expect(wrapper.emitted('add-redaction')).toEqual([
      [{ x: 15, y: 25, width: 80, height: 40 }],
    ]);
  });

  it('shows an inline alert and does not emit malformed geometry', async () => {
    const wrapper = mount(ImageWorkspace, { props: { workspace: WORKSPACE } });

    await wrapper.get('#ocr-crop-x').setValue('10');
    await wrapper.get('#ocr-crop-y').setValue('20');
    await wrapper.get('#ocr-crop-width').setValue('0');
    await wrapper.get('#ocr-crop-height').setValue('200');
    await wrapper.get('[data-testid="apply-crop"]').trigger('click');

    expect(wrapper.find('[role="alert"]').text()).toContain('宽度和高度必须大于 0');
    expect(wrapper.emitted('set-crop')).toBeUndefined();
  });

  it('renders an empty state and disables all workspace commands when unavailable', () => {
    const wrapper = mount(ImageWorkspace, {
      props: { workspace: null, disabled: true },
    });

    expect(wrapper.text()).toContain('尚未载入本地图片');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.findAll<HTMLButtonElement>('button').every((button) => button.element.disabled)).toBe(true);
  });

  it('imports only the serializable workspace snapshot type and no sensitive browser objects', () => {
    expect(imageWorkspaceSource).toContain(
      "import type { ImageWorkspaceSnapshot } from '@/ocr/imageWorkspace';",
    );
    expect(imageWorkspaceSource).not.toMatch(
      /\b(?:File|Blob|HTMLCanvasElement|CanvasRenderingContext2D|rawOcr|rawText)\b/,
    );
    expect(imageWorkspaceSource).not.toMatch(/@\/(?:api|stores)\//);
    expect(imageWorkspaceSource).not.toMatch(
      /\b(?:fetch|localStorage|sessionStorage|console\.)/,
    );
  });
});
