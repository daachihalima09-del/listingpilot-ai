import { DetectorExecutionError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  DetectorExecutionRecord,
  IntelligenceContext,
  IntelligenceIssue,
} from '../domain/types.ts';
import { validateIssue } from '../domain/validation.ts';
import type { IntelligenceRuntimeServices } from '../deterministic/services.ts';
import type {
  DetectorResult,
  DetectorRunOutput,
  IntelligenceDetector,
  SkippedDetector,
} from './contract.ts';
import { withDetectorResultMetadata } from './execution-metadata.ts';
import { DetectorRegistry } from './registry.ts';

interface TimedOut {
  readonly timedOut: true;
}

function timeoutAfter(milliseconds: number): {
  readonly promise: Promise<TimedOut>;
  cancel(): void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    promise: new Promise((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), milliseconds);
    }),
    cancel: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

function safeDuration(start: number, end: number): number {
  return Math.max(0, end - start);
}

function executionRecord(input: {
  detector: IntelligenceDetector;
  status: DetectorExecutionRecord['status'];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  result?: DetectorResult;
  reasonCode?: string;
}): DetectorExecutionRecord {
  return {
    detectorId: input.detector.metadata.id,
    detectorVersion: input.detector.metadata.version,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    issueCount: input.result?.issues.length ?? 0,
    warningCount: input.result?.warnings.length ?? 0,
    metrics: input.result?.metrics ?? {},
    ...(input.result ? { metadata: input.result.metadata } : {}),
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
  };
}

export class DetectorRunner {
  private readonly registry: DetectorRegistry;
  private readonly runtime: IntelligenceRuntimeServices;

  constructor(
    registry: DetectorRegistry,
    runtime: IntelligenceRuntimeServices,
  ) {
    this.registry = registry;
    this.runtime = runtime;
  }

  async run(context: IntelligenceContext): Promise<DetectorRunOutput> {
    const resolution = this.registry.resolve(context);
    const issues: IntelligenceIssue[] = [];
    const warnings: string[] = [];
    const executions: DetectorExecutionRecord[] = [];
    const skipped: SkippedDetector[] = [...resolution.skipped];
    const failed = new Set<string>();
    const globalStart = this.runtime.clock.nowMilliseconds();
    let activeContext = context;

    for (const detector of resolution.eligible) {
      const globalElapsed = safeDuration(globalStart, this.runtime.clock.nowMilliseconds());
      if (context.cancellation.isCancellationRequested) {
        skipped.push({
          detectorId: detector.metadata.id,
          detectorVersion: detector.metadata.version,
          reasonCode: 'CANCELLED',
        });
        continue;
      }
      if (globalElapsed >= context.options.globalTimeoutMs) {
        skipped.push({
          detectorId: detector.metadata.id,
          detectorVersion: detector.metadata.version,
          reasonCode: 'GLOBAL_TIMEOUT',
        });
        continue;
      }

      const startedAt = this.runtime.clock.now();
      const startedMs = this.runtime.clock.nowMilliseconds();
      const timeoutMs = Math.min(
        detector.metadata.timeoutMs ?? context.options.detectorTimeoutMs,
        context.options.globalTimeoutMs - globalElapsed,
      );
      const timeout = timeoutAfter(timeoutMs);
      try {
        const outcome = await Promise.race([
          Promise.resolve(detector.execute(activeContext)),
          timeout.promise,
        ]);
        const completedAt = this.runtime.clock.now();
        const durationMs = safeDuration(startedMs, this.runtime.clock.nowMilliseconds());
        if ('timedOut' in outcome) {
          failed.add(detector.metadata.id);
          warnings.push(`Detector ${detector.metadata.id} timed out.`);
          executions.push(executionRecord({
            detector,
            status: 'TIMED_OUT',
            startedAt,
            completedAt,
            durationMs,
            reasonCode: 'DETECTOR_TIMEOUT',
          }));
          if (context.options.failFast) break;
          continue;
        }
        for (const issue of outcome.issues) validateIssue(issue);
        issues.push(...outcome.issues);
        warnings.push(...outcome.warnings);
        executions.push(executionRecord({
          detector,
          status: 'COMPLETED',
          startedAt,
          completedAt,
          durationMs,
          result: outcome,
        }));
        activeContext = withDetectorResultMetadata(
          activeContext,
          detector.metadata.id,
          outcome.metadata,
        );
      } catch (error) {
        const completedAt = this.runtime.clock.now();
        const durationMs = safeDuration(startedMs, this.runtime.clock.nowMilliseconds());
        const reasonCode = error instanceof DetectorExecutionError
          ? error.code
          : 'UNEXPECTED_DETECTOR_FAILURE';
        failed.add(detector.metadata.id);
        warnings.push(`Detector ${detector.metadata.id} failed with ${reasonCode}.`);
        executions.push(executionRecord({
          detector,
          status: 'FAILED',
          startedAt,
          completedAt,
          durationMs,
          reasonCode,
        }));
        if (context.options.failFast) break;
      } finally {
        timeout.cancel();
      }
    }

    return immutableCopy({
      issues,
      warnings,
      executions,
      skipped,
      failedDetectorIds: [...failed].sort(),
    }) as unknown as DetectorRunOutput;
  }
}
