import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import App from './App.vue';

function mountAppAt(path: string) {
  return mount(App, {
    global: {
      plugins: [createPinia()],
      mocks: {
        $route: { path }
      },
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="to"><slot /></a>'
        },
        RouterView: {
          template: '<main data-test="route-view">route view</main>'
        }
      }
    }
  });
}

describe('App shell navigation', () => {
  it('renders the public website route without the console shell', () => {
    const wrapper = mountAppAt('/');

    expect(wrapper.find('.app-sidebar').exists()).toBe(false);
    expect(wrapper.find('.app-topbar').exists()).toBe(false);
    expect(wrapper.find('[data-test="route-view"]').exists()).toBe(true);
  });

  it('keeps five primary mobile entries while exposing extra workflow pages for desktop', () => {
    const wrapper = mountAppAt('/dashboard');

    const notice = wrapper.get('[data-testid="public-trial-notice"]');
    expect(notice.text()).toContain('休眠、重启或升级后');
    expect(notice.text()).toContain('草稿、方案及复盘数据可能被清空');
    expect(notice.text()).toContain('请勿上传敏感信息或无权使用的图片');
    expect(
      notice.get('a[href="https://github.com/TomLeo-ai/football-lottery-analysis-lab/issues"]'),
    ).toBeTruthy();

    const navLinks = wrapper.findAll('.app-sidebar__nav a');
    const mobilePrimaryLinks = wrapper.findAll('.app-sidebar__nav a:not(.app-sidebar__nav-extra)');

    expect(navLinks.map((link) => link.text())).toEqual([
      '仪表盘',
      '官方外链入口',
      '截图 OCR',
      '人工确认',
      'AI 分析',
      '比赛工作台',
      '模拟方案',
      '复盘中心',
      '策略实验室',
      '模型设置',
      '合规说明'
    ]);
    expect(mobilePrimaryLinks).toHaveLength(5);
  });
});
