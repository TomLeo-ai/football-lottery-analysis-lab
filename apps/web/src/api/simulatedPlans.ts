import { requestJson } from '@/api/http';
import type {
  SimulatedPlan,
  SimulatedPlanSavePayload,
  StrategySimulationPayload,
} from '@/types/simulatedPlan';

export function normalizeStrategySimulationPayload(
  payload: StrategySimulationPayload,
): StrategySimulationPayload {
  return { reportId: payload.reportId };
}

export function normalizeSimulatedPlanSavePayload(
  payload: SimulatedPlanSavePayload,
): SimulatedPlanSavePayload {
  return {
    generatedPlanId: payload.generatedPlanId,
    operatorNote: payload.operatorNote.trim(),
  };
}

export function simulateStrategy(
  payload: StrategySimulationPayload,
  idempotencyKey: string,
): Promise<SimulatedPlan> {
  return requestJson<SimulatedPlan>('/api/strategies/simulate', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: normalizeStrategySimulationPayload(payload),
  });
}

export function saveSimulatedPlan(
  payload: SimulatedPlanSavePayload,
  idempotencyKey: string,
): Promise<SimulatedPlan> {
  return requestJson<SimulatedPlan>('/api/simulated-plans', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: normalizeSimulatedPlanSavePayload(payload),
  });
}

export function listSimulatedPlans(): Promise<SimulatedPlan[]> {
  return requestJson<SimulatedPlan[]>('/api/simulated-plans');
}

export function getSimulatedPlan(planId: string): Promise<SimulatedPlan> {
  return requestJson<SimulatedPlan>(`/api/simulated-plans/${encodeURIComponent(planId)}`);
}
