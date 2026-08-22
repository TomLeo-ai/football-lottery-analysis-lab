import type { ApiResult } from '@/types/api';
import type { AnalysisGeneratePayload, AnalysisReport } from '@/types/analysis';

export async function generateAnalysis(payload: AnalysisGeneratePayload): Promise<AnalysisReport> {
  const response = await fetch('/api/analysis/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Analysis request failed: ${response.status}`);
  }

  const result = (await response.json()) as ApiResult<AnalysisReport>;

  if (result.code !== 200) {
    throw new Error(result.msg || 'Analysis request failed');
  }

  return result.data;
}

