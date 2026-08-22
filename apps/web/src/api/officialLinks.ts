import type { ApiResult } from '@/types/api';
import type { OfficialLink } from '@/types/officialLink';

export async function fetchOfficialLinks(): Promise<OfficialLink[]> {
  const response = await fetch('/api/official-links');

  if (!response.ok) {
    throw new Error(`Official links request failed: ${response.status}`);
  }

  const result = (await response.json()) as ApiResult<OfficialLink[]>;

  if (result.code !== 200) {
    throw new Error(result.msg || 'Official links request failed');
  }

  return result.data;
}

