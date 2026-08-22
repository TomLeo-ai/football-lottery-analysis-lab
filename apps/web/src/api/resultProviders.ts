import type { ApiResult } from '@/types/api';
import type {
  PublicResultProviderStatus,
  PublicResultProviderSyncPayload
} from '@/types/resultProvider';

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

export async function getResultProviderStatus(): Promise<PublicResultProviderStatus> {
  const response = await fetch('/api/result-providers/status');
  return parseResult<PublicResultProviderStatus>(response, 'Result provider status request failed');
}

export async function syncResultProvider(
  payload: PublicResultProviderSyncPayload
): Promise<PublicResultProviderStatus> {
  const response = await fetch('/api/result-providers/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return parseResult<PublicResultProviderStatus>(response, 'Result provider sync request failed');
}
