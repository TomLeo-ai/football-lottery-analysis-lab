<script setup lang="ts">
import { RouterLink } from 'vue-router';

const navItems = [
  { label: '能力', href: '#capabilities' },
  { label: '流程', href: '#workflow' },
  { label: '界面', href: '#interfaces' },
  { label: '合规', href: '#compliance' }
];

const trustSignals = [
  {
    label: '本地确认后分析',
    value: 'Confirmed Input',
    description: '截图 OCR 后先由用户确认，再进入模拟分析链路。'
  },
  {
    label: '规则引擎优先',
    value: 'Rule Engine First',
    description: '默认规则引擎保持权威路径，模型只做可审计辅助。'
  },
  {
    label: '审计辅助模型',
    value: 'Audited Assist',
    description: 'OpenAI-compatible 调用只保留哈希和结构化元数据。'
  }
];

const hudSignals = ['OCR Confirmed', 'Rule Engine Active', 'Audit Trail Ready'];

const capabilityPods = [
  {
    eyebrow: 'Input Bay',
    title: '输入确认舱',
    description: '把虚构截图、本地 OCR 和人工确认放在同一条输入轨道中，未确认字段不会进入后续判断。',
    tags: ['截图 OCR', '本地解析', '人工确认']
  },
  {
    eyebrow: 'Simulation Core',
    title: '模拟分析舱',
    description: '用规则引擎生成可解释的模拟分析，保存参数快照和方案上下文，便于之后复盘。',
    tags: ['规则引擎', '参数快照', '模拟方案']
  },
  {
    eyebrow: 'Review Matrix',
    title: '复盘审计舱',
    description: '赛果回流后完成匹配、结算和归因复盘，模型洞察只作为可审计辅助信号。',
    tags: ['赛果匹配', '归因复盘', '模型审计']
  }
];

const workflowSteps = [
  {
    title: '截图输入',
    description: '上传虚构样例截图，进入本地解析流程。'
  },
  {
    title: '人工确认',
    description: '确认比赛、市场、赔率和风险偏好。'
  },
  {
    title: '规则/模型辅助分析',
    description: '规则引擎先运行，模型能力只做可审计辅助。'
  },
  {
    title: '模拟方案',
    description: '保存生成参数、选择和不可变快照。'
  },
  {
    title: '赛果同步',
    description: '使用 Mock 或合规公开体育比分源抽象。'
  },
  {
    title: '复盘归因',
    description: '回看当时假设，沉淀策略修正规则。'
  }
];

const interfaceScreens = [
  {
    src: '/product-screens/dashboard.png',
    alt: 'Football Lottery Analysis Lab 闭环仪表盘界面',
    label: 'Command Dashboard',
    title: '闭环流程仪表盘'
  },
  {
    src: '/product-screens/strategy-simulator.png',
    alt: 'Football Lottery Analysis Lab 策略分析界面',
    label: 'Simulation Core',
    title: '规则分析工作台'
  },
  {
    src: '/product-screens/review-center.png',
    alt: 'Football Lottery Analysis Lab 复盘中心界面',
    label: 'Review Matrix',
    title: '赛后复盘中心'
  },
  {
    src: '/product-screens/model-settings.png',
    alt: 'Football Lottery Analysis Lab 模型设置界面',
    label: 'Audit Settings',
    title: '可审计模型设置'
  }
];

const complianceBoundaries = [
  '非官方开源实验项目',
  '仅支持虚构样例、本地 OCR 确认、模拟分析和赛后复盘',
  '不提供真实购买、支付、出票',
  '不提供资金出入能力，不承诺结果'
];
</script>

<template>
  <main class="marketing-home">
    <nav class="marketing-nav" aria-label="官网导航">
      <a class="marketing-nav__brand" href="#top" aria-label="返回官网首屏">
        <span class="marketing-nav__mark" aria-hidden="true">FL</span>
        <span>Football Lottery Analysis Lab</span>
      </a>

      <div class="marketing-nav__links" aria-label="官网页面锚点">
        <a v-for="item in navItems" :key="item.href" :href="item.href">{{ item.label }}</a>
      </div>

      <RouterLink class="marketing-button marketing-button--compact" to="/dashboard">进入工作台</RouterLink>
    </nav>

    <section id="top" class="marketing-hero" aria-labelledby="marketing-title">
      <div class="marketing-hero__content">
        <p class="marketing-kicker">非官方 · 开源研究工具 · 仅模拟分析/复盘</p>
        <h1 id="marketing-title">Football Lottery Analysis Lab</h1>
        <p class="marketing-hero__tagline">把每一次判断，变成可复盘的实验</p>
        <p class="marketing-hero__summary">
          从虚构截图、本地 OCR、人工确认，到规则引擎模拟分析、方案快照、赛后复盘和可审计模型辅助，
          构建一套清晰、克制、可回放的足球数据研究 Command Center。
        </p>
        <div class="marketing-hero__actions">
          <RouterLink class="marketing-button marketing-button--primary" to="/dashboard">进入工作台</RouterLink>
          <RouterLink class="marketing-button marketing-button--ghost" to="/about-compliance">查看合规边界</RouterLink>
        </div>
      </div>

      <div class="marketing-command" aria-label="产品指挥舱预览">
        <div class="marketing-command__rail" aria-hidden="true"></div>
        <figure class="marketing-command__screen marketing-command__screen--main">
          <img :src="'/product-screens/dashboard.png'" alt="Football Lottery Analysis Lab 闭环仪表盘主界面" />
          <figcaption>
            <span>Live Control Deck</span>
            <strong>Dashboard</strong>
          </figcaption>
        </figure>

        <figure class="marketing-command__screen marketing-command__screen--analysis">
          <img :src="'/product-screens/strategy-simulator.png'" alt="Football Lottery Analysis Lab 策略分析界面" />
          <figcaption>Simulation Core</figcaption>
        </figure>

        <figure class="marketing-command__screen marketing-command__screen--review">
          <img :src="'/product-screens/review-center.png'" alt="Football Lottery Analysis Lab 复盘中心界面" />
          <figcaption>Review Matrix</figcaption>
        </figure>

        <div class="marketing-hud" aria-label="产品状态">
          <span v-for="signal in hudSignals" :key="signal">{{ signal }}</span>
        </div>
      </div>

      <dl class="marketing-trust-grid" aria-label="核心可信能力">
        <div v-for="signal in trustSignals" :key="signal.label" class="marketing-trust-card">
          <dt>{{ signal.label }}</dt>
          <dd>
            <strong>{{ signal.value }}</strong>
            <span>{{ signal.description }}</span>
          </dd>
        </div>
      </dl>
    </section>

    <section id="capabilities" class="marketing-section marketing-section--capabilities" aria-labelledby="capabilities-title">
      <div class="marketing-section__heading">
        <p class="marketing-kicker">Capabilities</p>
        <h2 id="capabilities-title">三座核心能力舱，把研究流程收束成一条闭环</h2>
      </div>

      <div class="marketing-pod-grid">
        <article v-for="pod in capabilityPods" :key="pod.title" class="marketing-pod">
          <span class="marketing-pod__eyebrow">{{ pod.eyebrow }}</span>
          <h3>{{ pod.title }}</h3>
          <p>{{ pod.description }}</p>
          <div class="marketing-pod__tags" aria-label="能力标签">
            <span v-for="tag in pod.tags" :key="tag">{{ tag }}</span>
          </div>
        </article>
      </div>
    </section>

    <section id="workflow" class="marketing-section marketing-section--workflow" aria-labelledby="workflow-title">
      <div class="marketing-section__heading">
        <p class="marketing-kicker">Workflow Rail</p>
        <h2 id="workflow-title">从截图输入到复盘归因，每一步都留在光轨上</h2>
      </div>

      <ol class="marketing-timeline">
        <li v-for="(step, index) in workflowSteps" :key="step.title" class="marketing-timeline__item">
          <span class="marketing-timeline__number">{{ String(index + 1).padStart(2, '0') }}</span>
          <strong>{{ step.title }}</strong>
          <p>{{ step.description }}</p>
        </li>
      </ol>
    </section>

    <section id="interfaces" class="marketing-section marketing-section--interfaces" aria-labelledby="interfaces-title">
      <div class="marketing-section__heading">
        <p class="marketing-kicker">Interface Deck</p>
        <h2 id="interfaces-title">真实产品界面，直接展示能力边界</h2>
      </div>

      <div class="marketing-interface-deck">
        <figure class="marketing-interface-deck__main">
          <img :src="interfaceScreens[0].src" :alt="interfaceScreens[0].alt" />
          <figcaption>
            <span>{{ interfaceScreens[0].label }}</span>
            <strong>{{ interfaceScreens[0].title }}</strong>
          </figcaption>
        </figure>

        <div class="marketing-interface-deck__thumbs">
          <figure v-for="screen in interfaceScreens.slice(1)" :key="screen.src" class="marketing-interface-thumb">
            <img :src="screen.src" :alt="screen.alt" loading="lazy" />
            <figcaption>
              <span>{{ screen.label }}</span>
              <strong>{{ screen.title }}</strong>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>

    <section id="compliance" class="marketing-section marketing-compliance" aria-labelledby="compliance-title">
      <div class="marketing-compliance__content">
        <p class="marketing-kicker">Compliance Boundary</p>
        <h2 id="compliance-title">边界清楚，能力只服务技术研究</h2>
        <p>
          Football Lottery Analysis Lab 是非官方开源实验项目，仅支持虚构样例、本地 OCR 确认、
          模拟分析和赛后复盘。规则引擎保持权威路径，OpenAI-compatible 能力只提供可审计辅助。
        </p>
      </div>

      <ul class="marketing-compliance__list" aria-label="合规边界">
        <li v-for="boundary in complianceBoundaries" :key="boundary">{{ boundary }}</li>
      </ul>

      <RouterLink class="marketing-button marketing-button--primary" to="/about-compliance">查看合规边界</RouterLink>
    </section>
  </main>
</template>
