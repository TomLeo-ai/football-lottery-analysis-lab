import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import MarketingHome from './MarketingHome.vue';

describe('MarketingHome', () => {
  it('presents the official website hero, compliance boundary, and product screenshots', () => {
    const wrapper = mount(MarketingHome, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>'
          }
        }
      }
    });

    expect(wrapper.text()).toContain('Football Lottery Analysis Lab');
    expect(wrapper.text()).toContain('把每一次判断，变成可复盘的实验');
    expect(wrapper.text()).toContain('非官方');
    expect(wrapper.text()).toContain('仅模拟分析/复盘');
    expect(wrapper.text()).toContain('规则引擎优先');
    expect(wrapper.text()).toContain('审计辅助模型');
    expect(wrapper.text()).toContain('OCR Confirmed');
    expect(wrapper.text()).toContain('Rule Engine Active');
    expect(wrapper.text()).toContain('Audit Trail Ready');
    expect(wrapper.text()).toContain('不提供真实购买、支付、出票');

    const nav = wrapper.get('.marketing-nav');
    expect(nav.text()).toContain('能力');
    expect(nav.text()).toContain('流程');
    expect(nav.text()).toContain('界面');
    expect(nav.text()).toContain('合规');

    expect(wrapper.find('a[href="/dashboard"]').text()).toContain('进入工作台');
    expect(wrapper.find('a[href="/about-compliance"]').text()).toContain('查看合规边界');
    expect(wrapper.find('img[src="/product-screens/dashboard.png"]').exists()).toBe(true);
  });
});
