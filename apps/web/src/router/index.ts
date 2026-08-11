import { createRouter, createWebHistory } from 'vue-router';

import AboutCompliance from '@/views/AboutCompliance.vue';
import Dashboard from '@/views/Dashboard.vue';
import MarketingHome from '@/views/MarketingHome.vue';
import MatchWorkspace from '@/views/MatchWorkspace.vue';
import ModelSettings from '@/views/ModelSettings.vue';
import OcrReviewWizard from '@/views/OcrReviewWizard.vue';
import OfficialSourceHub from '@/views/OfficialSourceHub.vue';
import ReviewCenter from '@/views/ReviewCenter.vue';
import SavedPlans from '@/views/SavedPlans.vue';
import ScreenshotUpload from '@/views/ScreenshotUpload.vue';
import StrategyLab from '@/views/StrategyLab.vue';
import StrategySimulator from '@/views/StrategySimulator.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'MarketingHome',
      component: MarketingHome
    },
    {
      path: '/dashboard',
      name: 'Dashboard',
      component: Dashboard
    },
    {
      path: '/official-source-hub',
      name: 'OfficialSourceHub',
      component: OfficialSourceHub
    },
    {
      path: '/screenshot-upload',
      name: 'ScreenshotUpload',
      component: ScreenshotUpload
    },
    {
      path: '/ocr-review',
      name: 'OcrReviewWizard',
      component: OcrReviewWizard
    },
    {
      path: '/match-workspace',
      name: 'MatchWorkspace',
      component: MatchWorkspace
    },
    {
      path: '/strategy-simulator',
      name: 'StrategySimulator',
      component: StrategySimulator
    },
    {
      path: '/saved-plans',
      name: 'SavedPlans',
      component: SavedPlans
    },
    {
      path: '/review-center',
      name: 'ReviewCenter',
      component: ReviewCenter
    },
    {
      path: '/strategy-lab',
      name: 'StrategyLab',
      component: StrategyLab
    },
    {
      path: '/model-settings',
      name: 'ModelSettings',
      component: ModelSettings
    },
    {
      path: '/about-compliance',
      name: 'AboutCompliance',
      component: AboutCompliance
    }
  ]
});

export default router;
