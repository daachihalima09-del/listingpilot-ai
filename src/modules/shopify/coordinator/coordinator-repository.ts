import type {
  CoordinatorOverallStatus,
  CoordinatorStep,
  CoordinatorStepStatus,
  CoordinatorTrigger,
  NormalizedStepResult,
} from './coordinator-types.ts';
import type {
  CoordinatorApplicabilityInput,
} from './applicability.ts';

export interface CoordinatorProjectContext {
  actorUserId: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  archived: boolean;
  shopifyStoreId: string | null;
  connected: boolean;
  productInput: unknown;
  applicability: CoordinatorApplicabilityInput;
}

export interface StoredCoordinatorExecution {
  id: string;
  status: CoordinatorOverallStatus;
  triggerType: CoordinatorTrigger;
  executionNumber: number;
  startedAt: Date;
  completedAt: Date | null;
  lastHeartbeatAt: Date;
  steps: Array<{
    step: CoordinatorStep;
    status: CoordinatorStepStatus;
    attemptNumber: number;
    startedAt: Date | null;
    completedAt: Date | null;
    retryable: boolean;
    blocking: boolean;
    safeErrorCategory: string | null;
    safeMessage: string | null;
    resultSummary: unknown;
    freshnessKey: string | null;
  }>;
}

export interface CoordinatorRepository {
  resolveProject(
    actorUserId: string,
    projectId: string,
  ): Promise<CoordinatorProjectContext | null>;
  latest(context: CoordinatorProjectContext): Promise<StoredCoordinatorExecution | null>;
  acquire(input: {
    context: CoordinatorProjectContext;
    triggerType: CoordinatorTrigger;
    staleBefore: Date;
  }): Promise<{
    execution: StoredCoordinatorExecution;
    coalesced: boolean;
    staleRecovered: boolean;
  }>;
  beginStep(executionId: string, step: CoordinatorStep): Promise<number>;
  finishStep(
    executionId: string,
    result: NormalizedStepResult,
  ): Promise<void>;
  completeExecution(
    executionId: string,
    status: CoordinatorOverallStatus,
    completedAt: Date,
  ): Promise<void>;
  audit(input: {
    context: CoordinatorProjectContext;
    triggerType: CoordinatorTrigger;
    status: CoordinatorOverallStatus;
    executionNumber: number;
    action: string;
    steps: NormalizedStepResult[];
  }): Promise<void>;
}
