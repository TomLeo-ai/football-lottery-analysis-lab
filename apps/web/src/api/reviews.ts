import type { ApiResult } from '@/types/officialLink';
import type { PendingReviewPlan, ResultMatch, ReviewRecord, ReviewSettlePayload } from '@/types/review';

async function parseResult<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${fallbackMessage}: ${response.status}`);
  }

  const result = (await response.json()) as ApiResult<T>;
  if (result.code !== 200) {
    throw new Error(result.msg || fallbackMessage);
  }

  return result.data;
}

export async function listPendingReviews(): Promise<PendingReviewPlan[]> {
  const response = await fetch('/api/reviews/pending');
  return parseResult<PendingReviewPlan[]>(response, 'Pending review list failed');
}

export async function matchPlanResult(planId: string): Promise<ResultMatch> {
  const response = await fetch(`/api/simulated-plans/${encodeURIComponent(planId)}/match-result`, {
    method: 'POST'
  });
  return parseResult<ResultMatch>(response, 'Result matching failed');
}

export async function settlePlan(planId: string, payload?: ReviewSettlePayload): Promise<ReviewRecord> {
  const response = await fetch(`/api/simulated-plans/${encodeURIComponent(planId)}/settle`, {
    method: 'POST',
    ...(payload
      ? {
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      : {})
  });
  return parseResult<ReviewRecord>(response, 'Plan settlement failed');
}

export async function getPlanReview(planId: string): Promise<ReviewRecord> {
  const response = await fetch(`/api/simulated-plans/${encodeURIComponent(planId)}/review`);
  return parseResult<ReviewRecord>(response, 'Review record request failed');
}
