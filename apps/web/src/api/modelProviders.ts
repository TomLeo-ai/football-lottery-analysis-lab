import type { ApiResult } from '@/types/api';
import type {
  EngineSettings,
  EngineSettingsUpdatePayload,
  ModelProvider,
  ModelProviderConnectionTest
} from '@/types/modelProvider';

export async function fetchModelProviders(): Promise<ModelProvider[]> {
  const response = await fetch('/api/model-providers');

  if (!response.ok) {
    throw new Error(`Model provider request failed: ${response.status}`);
  }

  const result = (await response.json()) as ApiResult<ModelProvider[]>;

  if (result.code !== 200) {
    throw new Error(result.msg || 'Model provider request failed');
  }

  return result.data;
}

export async function testModelProvider(
  providerKey: string,
  modelId: string
): Promise<ModelProviderConnectionTest> {
  const response = await fetch('/api/model-providers/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      providerKey,
      modelId
    })
  });

  if (!response.ok) {
    throw new Error(`Model provider test failed: ${response.status}`);
  }

  const result = (await response.json()) as ApiResult<ModelProviderConnectionTest>;

  if (result.code !== 200) {
    throw new Error(result.msg || 'Model provider test failed');
  }

  return result.data;
}

export async function fetchEngineSettings(): Promise<EngineSettings> {
  const response = await fetch('/api/engine-settings');

  if (!response.ok) {
    throw new Error(`Engine settings request failed: ${response.status}`);
  }

  const result = (await response.json()) as ApiResult<EngineSettings>;

  if (result.code !== 200) {
    throw new Error(result.msg || 'Engine settings request failed');
  }

  return result.data;
}

export async function updateEngineSettings(
  payload: EngineSettingsUpdatePayload
): Promise<EngineSettings> {
  const response = await fetch('/api/engine-settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Engine settings update failed: ${response.status}`);
  }

  const result = (await response.json()) as ApiResult<EngineSettings>;

  if (result.code !== 200) {
    throw new Error(result.msg || 'Engine settings update failed');
  }

  return result.data;
}
