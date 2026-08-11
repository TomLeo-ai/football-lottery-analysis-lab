import type { ApiResult } from '@/types/officialLink';
import type {
  SimulatedPlan,
  SimulatedPlanSavePayload,
  StrategySimulationPayload
} from '@/types/simulatedPlan';

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

export async function simulateStrategy(payload: StrategySimulationPayload): Promise<SimulatedPlan> {
  const response = await fetch('/api/strategies/simulate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return parseResult<SimulatedPlan>(response, 'Simulated plan generation failed');
}

export async function saveSimulatedPlan(payload: SimulatedPlanSavePayload): Promise<SimulatedPlan> {
  const response = await fetch('/api/simulated-plans', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return parseResult<SimulatedPlan>(response, 'Simulated plan save failed');
}

export async function listSimulatedPlans(): Promise<SimulatedPlan[]> {
  const response = await fetch('/api/simulated-plans');
  return parseResult<SimulatedPlan[]>(response, 'Simulated plan list failed');
}

export async function getSimulatedPlan(planId: string): Promise<SimulatedPlan> {
  const response = await fetch(`/api/simulated-plans/${encodeURIComponent(planId)}`);
  return parseResult<SimulatedPlan>(response, 'Simulated plan detail failed');
}
