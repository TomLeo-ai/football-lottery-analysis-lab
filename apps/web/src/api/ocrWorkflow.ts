import type { ApiResult } from '@/types/officialLink';
import type {
  ConfirmOcrReviewPayload,
  CreateScreenshotTaskPayload,
  OcrTask,
  ParseLocalOcrPayload,
  ScreenshotTask,
  UserConfirmedSnapshot
} from '@/types/ocrWorkflow';

async function postJson<TResponse, TPayload>(url: string, payload: TPayload): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const result = (await response.json()) as ApiResult<TResponse>;

  if (result.code !== 200) {
    throw new Error(result.msg || 'Request failed');
  }

  return result.data;
}

export function createScreenshotTask(payload: CreateScreenshotTaskPayload): Promise<ScreenshotTask> {
  return postJson<ScreenshotTask, CreateScreenshotTaskPayload>('/api/screenshots/tasks', payload);
}

export function parseLocalOcrResult(payload: ParseLocalOcrPayload): Promise<OcrTask> {
  return postJson<OcrTask, ParseLocalOcrPayload>('/api/ocr/parse-local-result', payload);
}

export function confirmOcrReview(payload: ConfirmOcrReviewPayload): Promise<UserConfirmedSnapshot> {
  return postJson<UserConfirmedSnapshot, ConfirmOcrReviewPayload>('/api/ocr/review/confirm', payload);
}

