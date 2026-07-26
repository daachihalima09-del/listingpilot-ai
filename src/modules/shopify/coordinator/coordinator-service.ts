import {
  aggregateCoordinatorStatus,
  safeOverallMessage,
  sanitizeStepSummary,
} from './aggregation.ts';
import {
  resolveCoordinatorApplicability,
  type StepApplicability,
} from './applicability.ts';
import { ShopifyCoordinatorError } from './coordinator-error.ts';
import type {
  CoordinatorProjectContext,
  CoordinatorRepository,
  StoredCoordinatorExecution,
} from './coordinator-repository.ts';
import {
  emptyCounts,
  STEP_DISPLAY_NAMES,
  type CoordinatorExecutionDto,
  type CoordinatorOverallStatus,
  type CoordinatorStep,
  type CoordinatorTrigger,
  type NormalizedStepResult,
} from './coordinator-types.ts';
import {
  buildCoordinatorRetryPlan,
  type RetryAction,
} from './retry-planner.ts';
import type { CoordinatorStepAdapter } from './step-adapters.ts';

export const COORDINATOR_LEASE_TIMEOUT_MS = 5 * 60 * 1_000;

function requireProject(context: CoordinatorProjectContext | null) {
  if (!context) {
    throw new ShopifyCoordinatorError(
      'SHOPIFY_COORDINATOR_NOT_FOUND',
      'The requested project is unavailable.',
      404,
    );
  }
  return context;
}

function requireOwner(context: CoordinatorProjectContext | null) {
  const project = requireProject(context);
  if (project.role !== 'OWNER') {
    throw new ShopifyCoordinatorError(
      'SHOPIFY_COORDINATOR_FORBIDDEN',
      'Store-owner permission is required to publish to Shopify.',
      403,
    );
  }
  if (project.archived) {
    throw new ShopifyCoordinatorError(
      'SHOPIFY_COORDINATOR_PROJECT_ARCHIVED',
      'Restore this project before publishing to Shopify.',
      409,
    );
  }
  if (!project.connected || !project.shopifyStoreId) {
    throw new ShopifyCoordinatorError(
      'SHOPIFY_COORDINATOR_STORE_NOT_CONNECTED',
      'Connect Shopify before publishing.',
      409,
    );
  }
  return project;
}

function counts(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyCounts();
  }
  const record = value as Record<string, unknown>;
  const number = (key: string) => (
    typeof record[key] === 'number' && Number.isSafeInteger(record[key])
      ? Math.max(0, record[key] as number)
      : 0
  );
  return {
    created: number('created'),
    updated: number('updated'),
    unchanged: number('unchanged'),
    pending: number('pending'),
    failed: number('failed'),
  };
}

function fromStored(
  execution: StoredCoordinatorExecution,
  applicability: StepApplicability[],
): NormalizedStepResult[] {
  const stored = new Map(execution.steps.map((step) => [step.step, step]));
  return applicability.map((item) => {
    const step = stored.get(item.step);
    return {
      step: item.step,
      status: step?.status ?? (item.applicable ? 'NOT_STARTED' : 'SKIPPED'),
      startedAt: step?.startedAt?.toISOString() ?? null,
      completedAt: step?.completedAt?.toISOString() ?? null,
      attemptNumber: step?.attemptNumber ?? 0,
      counts: counts(step?.resultSummary),
      safeMessage: step?.safeMessage ?? item.safeMessage,
      safeErrorCategory: step?.safeErrorCategory ?? null,
      retryable: step?.retryable ?? false,
      blocking: step?.blocking ?? false,
      applicable: item.applicable,
      freshnessKey: step?.freshnessKey ?? item.freshnessKey,
    };
  });
}

export function buildCoordinatorDto(
  context: CoordinatorProjectContext,
  execution: StoredCoordinatorExecution | null,
): CoordinatorExecutionDto {
  const applicability = resolveCoordinatorApplicability(context.applicability);
  const steps = execution
    ? fromStored(execution, applicability)
    : applicability.map((item): NormalizedStepResult => ({
        step: item.step,
        status: item.applicable ? 'NOT_STARTED' : 'SKIPPED',
        startedAt: null,
        completedAt: null,
        attemptNumber: 0,
        counts: emptyCounts(),
        safeMessage: item.safeMessage,
        safeErrorCategory: null,
        retryable: false,
        blocking: false,
        applicable: item.applicable,
        freshnessKey: item.freshnessKey,
      }));
  const overallStatus = execution?.status ?? 'READY';
  const isRunning = overallStatus === 'RUNNING' || overallStatus === 'QUEUED';
  const hasPendingWork = steps.some(({ status }) => status === 'PENDING');
  return {
    overallStatus,
    executionStartedAt: execution?.startedAt.toISOString() ?? null,
    executionCompletedAt: execution?.completedAt?.toISOString() ?? null,
    canPublish: context.role === 'OWNER'
      && !context.archived
      && context.connected
      && context.applicability.productReady
      && !isRunning,
    canRetry: !isRunning && steps.some((step) => (
      step.retryable
      && ['FAILED', 'PARTIAL', 'BLOCKED'].includes(step.status)
    )),
    canRefresh: !isRunning && hasPendingWork,
    isRunning,
    hasPendingWork,
    safeSummary: overallStatus === 'READY'
      ? context.connected
        ? 'Ready to publish this project to Shopify.'
        : 'Connect Shopify before publishing.'
      : safeOverallMessage(overallStatus),
    steps: steps.map((step) => ({
      ...sanitizeStepSummary(step),
      displayName: STEP_DISPLAY_NAMES[step.step],
      progressLabel: step.status.replaceAll('_', ' ').toLocaleLowerCase('en-US'),
    })),
  };
}

function skipped(
  applicability: StepApplicability,
): NormalizedStepResult {
  const now = new Date().toISOString();
  return {
    step: applicability.step,
    status: 'SKIPPED',
    startedAt: now,
    completedAt: now,
    attemptNumber: 0,
    counts: emptyCounts(),
    safeMessage: applicability.safeMessage,
    safeErrorCategory: null,
    retryable: false,
    blocking: false,
    applicable: false,
    freshnessKey: applicability.freshnessKey,
  };
}

function blocked(
  applicability: StepApplicability,
  message = 'Blocked until the Shopify product linkage is safe.',
): NormalizedStepResult {
  const now = new Date().toISOString();
  return {
    step: applicability.step,
    status: 'BLOCKED',
    startedAt: now,
    completedAt: now,
    attemptNumber: 0,
    counts: { ...emptyCounts(), failed: 1 },
    safeMessage: message,
    safeErrorCategory: 'product_dependency_blocked',
    retryable: true,
    blocking: true,
    applicable: true,
    freshnessKey: applicability.freshnessKey,
  };
}

function actionFor(status: CoordinatorOverallStatus, trigger: CoordinatorTrigger) {
  if (trigger === 'MANUAL_RETRY') return 'shopify.publication_retried';
  if (trigger === 'REFRESH_PENDING') return 'shopify.publication_refreshed';
  switch (status) {
    case 'UNCHANGED': return 'shopify.publication_unchanged';
    case 'PARTIAL': return 'shopify.publication_partial';
    case 'PENDING': return 'shopify.publication_pending';
    case 'FAILED': return 'shopify.publication_failed';
    default: return 'shopify.publication_completed';
  }
}

function planFor(
  trigger: CoordinatorTrigger,
  previous: StoredCoordinatorExecution | null,
  applicability: StepApplicability[],
) {
  if (trigger === 'MANUAL_FULL') {
    return applicability.map((item) => ({
      step: item.step,
      action: item.applicable ? 'REASSESS' : 'SKIP' as RetryAction,
    }));
  }
  const retry = buildCoordinatorRetryPlan(previous?.steps ?? [], applicability);
  if (trigger === 'REFRESH_PENDING') {
    return retry.map((item) => ({
      ...item,
      action: item.action === 'REFRESH' ? 'REFRESH'
        : item.action === 'SKIP' ? 'SKIP' : 'KEEP_SUCCEEDED',
    } as { step: CoordinatorStep; action: RetryAction }));
  }
  return retry;
}

export async function getCoordinatorExecution(
  repository: CoordinatorRepository,
  context: CoordinatorProjectContext | null,
) {
  const project = requireProject(context);
  return buildCoordinatorDto(project, await repository.latest(project));
}

export async function runCoordinator(
  dependencies: {
    repository: CoordinatorRepository;
    adapters: CoordinatorStepAdapter[];
  },
  context: CoordinatorProjectContext | null,
  triggerType: CoordinatorTrigger,
) {
  const project = requireOwner(context);
  if (!project.applicability.productReady) {
    throw new ShopifyCoordinatorError(
      'SHOPIFY_COORDINATOR_PRODUCT_NOT_READY',
      'Complete the saved product listing before publishing.',
      409,
    );
  }
  const previous = await dependencies.repository.latest(project);
  if (
    triggerType === 'REFRESH_PENDING'
    && !previous?.steps.some(({ status }) => status === 'PENDING')
  ) {
    return buildCoordinatorDto(project, previous);
  }
  if (
    triggerType === 'MANUAL_RETRY'
    && !previous?.steps.some((step) => (
      step.retryable
      && ['FAILED', 'PARTIAL', 'BLOCKED', 'PENDING'].includes(step.status)
    ))
  ) {
    return buildCoordinatorDto(project, previous);
  }
  const acquired = await dependencies.repository.acquire({
    context: project,
    triggerType,
    staleBefore: new Date(Date.now() - COORDINATOR_LEASE_TIMEOUT_MS),
  });
  if (acquired.coalesced) {
    return buildCoordinatorDto(project, acquired.execution);
  }
  const execution = acquired.execution;
  const applicability = resolveCoordinatorApplicability(project.applicability);
  const plan = planFor(triggerType, previous, applicability);
  const priorResults = previous ? fromStored(previous, applicability) : [];
  const priorByStep = new Map(priorResults.map((step) => [step.step, step]));
  const adapterByStep = new Map(
    dependencies.adapters.map((adapter) => [adapter.step, adapter]),
  );
  const results: NormalizedStepResult[] = [];
  let productBlocked = false;

  await dependencies.repository.audit({
    context: project,
    triggerType,
    status: 'RUNNING',
    executionNumber: execution.executionNumber,
    action: acquired.staleRecovered
      ? 'shopify.publication_stale_recovered'
      : 'shopify.publication_started',
    steps: [],
  });

  for (const item of applicability) {
    const planned = plan.find(({ step }) => step === item.step)!;
    let result: NormalizedStepResult;
    if (!item.applicable || planned.action === 'SKIP') {
      result = skipped(item);
    } else if (productBlocked && item.step !== 'PRODUCT') {
      result = blocked(item);
    } else if (planned.action === 'KEEP_SUCCEEDED') {
      const previousResult = priorByStep.get(item.step);
      result = previousResult
        ? { ...previousResult, freshnessKey: item.freshnessKey }
        : blocked(item, 'No prior safe step result was available.');
    } else if (planned.action === 'BLOCKED') {
      result = blocked(item, 'Resolve this step’s configuration before retrying.');
      result.retryable = false;
    } else {
      const adapter = adapterByStep.get(item.step);
      if (!adapter) throw new Error(`Missing coordinator adapter: ${item.step}`);
      const attempt = await dependencies.repository.beginStep(
        execution.id,
        item.step,
      );
      result = planned.action === 'REFRESH' && adapter.refreshPending
        ? await adapter.refreshPending(project, attempt, item.freshnessKey)
        : await adapter.execute(project, attempt, item.freshnessKey);
    }
    result = sanitizeStepSummary(result);
    await dependencies.repository.finishStep(execution.id, result);
    results.push(result);
    if (
      item.step === 'PRODUCT'
      && (result.blocking || ['FAILED', 'BLOCKED', 'PARTIAL'].includes(result.status))
    ) productBlocked = true;
  }

  const status = aggregateCoordinatorStatus(results);
  const completedAt = new Date();
  await dependencies.repository.completeExecution(execution.id, status, completedAt);
  await dependencies.repository.audit({
    context: project,
    triggerType,
    status,
    executionNumber: execution.executionNumber,
    action: actionFor(status, triggerType),
    steps: results,
  });
  return buildCoordinatorDto(project, {
    ...execution,
    status,
    completedAt,
    lastHeartbeatAt: completedAt,
    steps: results.map((result) => ({
      step: result.step,
      status: result.status,
      attemptNumber: result.attemptNumber,
      startedAt: result.startedAt ? new Date(result.startedAt) : null,
      completedAt: result.completedAt ? new Date(result.completedAt) : null,
      retryable: result.retryable,
      blocking: result.blocking,
      safeErrorCategory: result.safeErrorCategory,
      safeMessage: result.safeMessage,
      resultSummary: result.counts,
      freshnessKey: result.freshnessKey,
    })),
  });
}
