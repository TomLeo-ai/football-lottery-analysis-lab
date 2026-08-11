import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import OfficialSourceHub from './OfficialSourceHub.vue';

const officialLinksResponse = {
  code: 200,
  msg: 'success',
  data: [
    {
      id: 'sporttery-home',
      name: '竞彩网官方信息入口',
      url: 'https://www.sporttery.cn/?pc=1',
      purpose: '外部链接入口，不复制官方页面数据。',
      region: 'CN',
      target: '_blank',
      rel: 'noopener noreferrer',
      nonOfficialNotice: '本项目非官方，仅提供外部链接入口。',
      dataPolicy: '不抓取、不缓存、不展示官方页面具体数据。',
      updatedAt: '2026-06-25T00:00:00+08:00'
    }
  ]
};

describe('OfficialSourceHub', () => {
  it('renders external links with safe link attributes and no iframe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(officialLinksResponse)
      })
    );

    const wrapper = mount(OfficialSourceHub);
    await flushPromises();

    const link = wrapper.get('a[data-testid="official-link-sporttery-home"]');
    expect(link.attributes('href')).toBe('https://www.sporttery.cn/?pc=1');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.text()).toContain('非官方');
    expect(wrapper.text()).toContain('仅模拟分析/复盘');
  });

  it('shows an error state with a retry path when links cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const wrapper = mount(OfficialSourceHub);
    await flushPromises();

    expect(wrapper.text()).toContain('官方外链入口加载失败');
    expect(wrapper.get('button').text()).toContain('重试');
  });
});

