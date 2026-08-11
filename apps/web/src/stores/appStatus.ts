import { defineStore } from 'pinia';

export const useAppStatusStore = defineStore('appStatus', {
  state: () => ({
    complianceNotice: '非官方 · 仅模拟分析/复盘 · 不构成购彩建议'
  })
});

