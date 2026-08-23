import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import AboutCompliance from '@/views/AboutCompliance.vue';
import Dashboard from '@/views/Dashboard.vue';
import LegacyWorkflowEntry from '@/views/LegacyWorkflowEntry.vue';
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
import WorkflowShell from '@/views/WorkflowShell.vue';

const WAITING_OCR_STAGES = ['WAITING_LOCAL_OCR', 'WAITING_USER_CONFIRMATION', 'CONFIRMED'];
const REVIEW_STAGES = ['WAITING_USER_CONFIRMATION', 'CONFIRMED'];
const AUTHORITY_READ_STAGES = ['CONFIRMED', 'ANALYSIS_GENERATED', 'PLAN_GENERATED', 'PENDING_RESULT'];
const PLAN_STAGES = ['ANALYSIS_GENERATED', 'PLAN_GENERATED', 'PENDING_RESULT'];
const PLAN_DETAIL_STAGES = ['PLAN_GENERATED', 'PENDING_RESULT'];

function legacyWorkflowEntry(
  path: string,
  name: string,
  targetName: string,
  title: string,
): RouteRecordRaw {
  return {
    path,
    name,
    component: LegacyWorkflowEntry,
    props: {
      targetName,
      title,
    },
  };
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'MarketingHome',
    component: MarketingHome,
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard,
  },
  {
    path: '/official-source-hub',
    name: 'OfficialSourceHub',
    component: OfficialSourceHub,
  },
  {
    path: '/screenshot-upload',
    name: 'ScreenshotUpload',
    component: ScreenshotUpload,
  },
  legacyWorkflowEntry('/ocr-review', 'OcrReviewWizard', 'WorkflowOcrReview', '人工确认'),
  legacyWorkflowEntry('/match-workspace', 'MatchWorkspace', 'WorkflowMatchWorkspace', '比赛工作台'),
  legacyWorkflowEntry('/strategy-simulator', 'StrategySimulator', 'WorkflowAnalysis', 'AI 分析'),
  legacyWorkflowEntry('/saved-plans', 'SavedPlans', 'WorkflowPlans', '模拟方案'),
  {
    path: '/workflows/:workflowId',
    component: WorkflowShell,
    children: [
      {
        path: '',
        redirect: { name: 'WorkflowOcrReview' },
      },
      {
        path: 'ocr',
        name: 'WorkflowOcr',
        component: ScreenshotUpload,
        meta: { allowedStages: WAITING_OCR_STAGES },
      },
      {
        path: 'ocr-review',
        name: 'WorkflowOcrReview',
        component: OcrReviewWizard,
        meta: { allowedStages: REVIEW_STAGES },
      },
      {
        path: 'match-workspace',
        name: 'WorkflowMatchWorkspace',
        component: MatchWorkspace,
        meta: { allowedStages: AUTHORITY_READ_STAGES },
      },
      {
        path: 'analysis',
        name: 'WorkflowAnalysis',
        component: StrategySimulator,
        meta: { allowedStages: AUTHORITY_READ_STAGES },
      },
      {
        path: 'plans',
        name: 'WorkflowPlans',
        component: SavedPlans,
        meta: { allowedStages: PLAN_STAGES },
      },
      {
        path: 'plans/:planId',
        name: 'WorkflowPlanDetail',
        component: SavedPlans,
        props: true,
        meta: { allowedStages: PLAN_DETAIL_STAGES },
      },
    ],
  },
  {
    path: '/review-center',
    name: 'ReviewCenter',
    component: ReviewCenter,
  },
  {
    path: '/strategy-lab',
    name: 'StrategyLab',
    component: StrategyLab,
  },
  {
    path: '/model-settings',
    name: 'ModelSettings',
    component: ModelSettings,
  },
  {
    path: '/about-compliance',
    name: 'AboutCompliance',
    component: AboutCompliance,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
