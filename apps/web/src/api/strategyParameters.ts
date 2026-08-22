import type { ApiResult } from '@/types/api';
import type { StrategyParameters } from '@/types/strategyParameter';

export async function fetchStrategyParameterDefaults(): Promise<StrategyParameters> {
  const response = await fetch('/api/strategy-parameter-defaults');

  if (!response.ok) {
    throw new Error(`Strategy parameter defaults request failed: ${response.status}`);
  }

  const result = (await response.json()) as ApiResult<StrategyParameters>;

  if (result.code !== 200) {
    throw new Error(result.msg || 'Strategy parameter defaults request failed');
  }

  return result.data;
}

export async function updateStrategyParameterDefaults(
  payload: StrategyParameters
): Promise<StrategyParameters> {
  const response = await fetch('/api/strategy-parameter-defaults', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Strategy parameter defaults update failed: ${response.status}`);
  }

  const result = (await response.json()) as ApiResult<StrategyParameters>;

  if (result.code !== 200) {
    throw new Error(result.msg || 'Strategy parameter defaults update failed');
  }

  return result.data;
}
