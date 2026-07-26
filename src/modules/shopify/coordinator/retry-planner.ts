import type {
  CoordinatorStep,
  CoordinatorStepStatus,
} from './coordinator-types.ts';
import type { StepApplicability } from './applicability.ts';

export type RetryAction =
  | 'RETRY' | 'REFRESH' | 'REASSESS'
  | 'KEEP_SUCCEEDED' | 'SKIP' | 'BLOCKED';

export interface PreviousStep {
  step: CoordinatorStep;
  status: CoordinatorStepStatus;
  retryable: boolean;
  freshnessKey: string | null;
}

export function buildCoordinatorRetryPlan(
  previous: PreviousStep[],
  current: StepApplicability[],
): Array<{ step: CoordinatorStep; action: RetryAction }> {
  const byStep = new Map(previous.map((step) => [step.step, step]));
  let productReassessed = false;
  return current.map((applicable) => {
    if (!applicable.applicable) return { step: applicable.step, action: 'SKIP' };
    const prior = byStep.get(applicable.step);
    if (!prior) return { step: applicable.step, action: 'REASSESS' };
    const changed = prior.freshnessKey !== applicable.freshnessKey;
    if (changed) {
      if (applicable.step === 'PRODUCT') productReassessed = true;
      return { step: applicable.step, action: 'REASSESS' };
    }
    if (productReassessed && applicable.step !== 'PRODUCT') {
      return { step: applicable.step, action: 'REASSESS' };
    }
    if (prior.status === 'PENDING') {
      return { step: applicable.step, action: 'REFRESH' };
    }
    if (prior.status === 'PARTIAL') {
      return { step: applicable.step, action: 'REASSESS' };
    }
    if (prior.status === 'FAILED' || prior.status === 'BLOCKED') {
      return {
        step: applicable.step,
        action: prior.retryable ? 'RETRY' : 'BLOCKED',
      };
    }
    if (prior.status === 'SUCCEEDED' || prior.status === 'UNCHANGED') {
      return { step: applicable.step, action: 'KEEP_SUCCEEDED' };
    }
    return { step: applicable.step, action: 'REASSESS' };
  });
}
