<template>
  <RouterView v-if="$route.path === '/'" />

  <div v-else class="app-shell">
    <aside class="app-sidebar" aria-label="主导航">
      <div class="app-sidebar__brand">
        <span class="app-sidebar__mark" aria-hidden="true">FL</span>
        <div>
          <strong>足彩分析实验室</strong>
          <span>Simulation Lab</span>
        </div>
      </div>

      <nav class="app-sidebar__nav">
        <RouterLink to="/dashboard">仪表盘</RouterLink>
        <RouterLink to="/official-source-hub">官方外链入口</RouterLink>
        <RouterLink to="/screenshot-upload">截图 OCR</RouterLink>
        <RouterLink to="/ocr-review">人工确认</RouterLink>
        <RouterLink to="/strategy-simulator">AI 分析</RouterLink>
        <RouterLink class="app-sidebar__nav-extra" to="/match-workspace">比赛工作台</RouterLink>
        <RouterLink class="app-sidebar__nav-extra" to="/saved-plans">模拟方案</RouterLink>
        <RouterLink class="app-sidebar__nav-extra" to="/review-center">复盘中心</RouterLink>
        <RouterLink class="app-sidebar__nav-extra" to="/strategy-lab">策略实验室</RouterLink>
        <RouterLink class="app-sidebar__nav-extra" to="/model-settings">模型设置</RouterLink>
        <RouterLink class="app-sidebar__nav-extra" to="/about-compliance">合规说明</RouterLink>
      </nav>
    </aside>

    <div class="app-main">
      <header class="app-topbar">
        <div>
          <p class="app-topbar__eyebrow">非官方 · 仅模拟分析/复盘</p>
          <h1>Football Lottery Analysis Lab</h1>
        </div>
        <span class="app-topbar__status">Compliance Guard Active</span>
      </header>

      <main class="app-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>
