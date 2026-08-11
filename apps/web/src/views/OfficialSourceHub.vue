<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { fetchOfficialLinks } from '@/api/officialLinks';
import type { OfficialLink } from '@/types/officialLink';

const links = ref<OfficialLink[]>([]);
const isLoading = ref(false);
const errorMessage = ref('');

async function loadOfficialLinks() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    links.value = await fetchOfficialLinks();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '官方外链入口加载失败';
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadOfficialLinks);
</script>

<template>
  <section class="official-source-hub" aria-labelledby="official-source-hub-title">
    <div class="page-heading">
      <div>
        <p class="page-heading__eyebrow">OfficialSourceHub</p>
        <h2 id="official-source-hub-title">官方外链入口</h2>
      </div>
      <p class="page-heading__notice">非官方 · 仅模拟分析/复盘 · 不展示官方具体赛事数据</p>
    </div>

    <div class="policy-panel" role="note">
      <strong>合规说明</strong>
      <p>
        本页面只维护外部链接、用途说明和非官方声明；不使用 iframe，不抓取、不缓存、不镜像、
        不展示官方页面中的具体赛程、赔率、玩法、赛果或开奖数据。
      </p>
    </div>

    <div v-if="isLoading" class="state-panel" aria-live="polite">
      <span class="state-panel__spinner" aria-hidden="true"></span>
      <span>正在加载官方外链入口...</span>
    </div>

    <div v-else-if="errorMessage" class="state-panel state-panel--error" role="alert">
      <div>
        <strong>官方外链入口加载失败</strong>
        <p>{{ errorMessage }}</p>
      </div>
      <button type="button" class="action-button" @click="loadOfficialLinks">重试</button>
    </div>

    <div v-else-if="links.length === 0" class="state-panel">
      <strong>暂无官方外链入口</strong>
      <p>请稍后重试，或联系维护者补充仅包含链接元数据的入口配置。</p>
    </div>

    <div v-else class="link-table-wrap">
      <table class="link-table">
        <caption>
          官方信息外链入口列表。表格仅展示链接元数据，不包含官方具体赛事、赔率或赛果数据。
        </caption>
        <thead>
          <tr>
            <th scope="col">名称</th>
            <th scope="col">用途</th>
            <th scope="col">数据边界</th>
            <th scope="col">入口</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="link in links" :key="link.id">
            <td>
              <strong>{{ link.name }}</strong>
              <span>{{ link.region }} · {{ link.updatedAt }}</span>
            </td>
            <td>{{ link.purpose }}</td>
            <td>
              <span class="policy-tag">非官方</span>
              <p>{{ link.nonOfficialNotice }}</p>
              <p>{{ link.dataPolicy }}</p>
            </td>
            <td>
              <a
                :data-testid="`official-link-${link.id}`"
                class="external-link"
                :href="link.url"
                :target="link.target"
                :rel="link.rel"
              >
                打开外部页面
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

