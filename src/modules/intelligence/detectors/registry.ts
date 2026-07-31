import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type { AnalysisScope, IntelligenceContext, IssueCategory } from '../domain/types.ts';
import type { IntelligenceDetector, SkippedDetector } from './contract.ts';

export interface DetectorRegistrySnapshot {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly deterministic: boolean;
}

interface DetectorRegistration {
  readonly detector: IntelligenceDetector;
  enabled: boolean;
}

export interface DetectorResolution {
  readonly eligible: readonly IntelligenceDetector[];
  readonly skipped: readonly SkippedDetector[];
}

export class DetectorRegistry {
  private readonly entries = new Map<string, DetectorRegistration>();

  register(detector: IntelligenceDetector): void {
    const metadata = detector.metadata;
    if (!metadata.id.trim() || !metadata.version.trim() || !metadata.displayName.trim()) {
      throw new IntelligenceDomainError('INVALID_DETECTOR', 'Detectors require an ID, display name, and version.');
    }
    if (!Number.isFinite(metadata.priority) || metadata.priority < 0 || metadata.supportedScopes.length === 0) {
      throw new IntelligenceDomainError('INVALID_DETECTOR', 'Detector priority and supported scopes are invalid.');
    }
    if (this.entries.has(metadata.id)) {
      throw new IntelligenceDomainError('DUPLICATE_REGISTRY_ENTRY', 'Detector ID is already registered.', {
        id: metadata.id,
      });
    }
    this.entries.set(metadata.id, { detector, enabled: metadata.enabled });
  }

  get(id: string): IntelligenceDetector | undefined {
    return this.entries.get(id)?.detector;
  }

  enable(id: string): void {
    this.require(id).enabled = true;
  }

  disable(id: string): void {
    this.require(id).enabled = false;
  }

  byCategory(category: IssueCategory): readonly IntelligenceDetector[] {
    return this.sorted()
      .filter(({ detector, enabled }) => enabled && detector.metadata.issueCategories.includes(category))
      .map(({ detector }) => detector);
  }

  byCapability(capabilityId: string): readonly IntelligenceDetector[] {
    return this.sorted()
      .filter(({ detector, enabled }) => enabled && detector.metadata.requiredCapabilities.includes(capabilityId))
      .map(({ detector }) => detector);
  }

  byKnowledgePack(knowledgePackId: string): readonly IntelligenceDetector[] {
    return this.sorted()
      .filter(({ detector, enabled }) => enabled && (
        !detector.metadata.compatibleKnowledgePacks
        || detector.metadata.compatibleKnowledgePacks.includes(knowledgePackId)
      ))
      .map(({ detector }) => detector);
  }

  byScope(scope: AnalysisScope): readonly IntelligenceDetector[] {
    return this.sorted()
      .filter(({ detector, enabled }) => enabled && detector.metadata.supportedScopes.includes(scope))
      .map(({ detector }) => detector);
  }

  resolve(context: IntelligenceContext): DetectorResolution {
    const capabilities = new Set(context.capabilityPackIds);
    const knowledge = new Set(context.knowledgePackIds);
    const disabledByContext = new Set(context.options.disabledDetectorIds);
    const enabledByContext = context.options.enabledDetectorIds
      ? new Set(context.options.enabledDetectorIds)
      : null;
    const eligible: IntelligenceDetector[] = [];
    const skipped: SkippedDetector[] = [];
    for (const entry of this.sorted()) {
      const { detector } = entry;
      let reason: SkippedDetector['reasonCode'] | null = null;
      if (!entry.enabled || disabledByContext.has(detector.metadata.id)
        || (enabledByContext && !enabledByContext.has(detector.metadata.id))) {
        reason = 'DISABLED';
      } else if (!detector.metadata.supportedScopes.includes(context.analysisScope)) {
        reason = 'UNSUPPORTED_SCOPE';
      } else if (!detector.metadata.requiredCapabilities.every((id) => capabilities.has(id))) {
        reason = 'MISSING_CAPABILITY';
      } else if (
        detector.metadata.compatibleKnowledgePacks
        && detector.metadata.compatibleKnowledgePacks.length > 0
        && !detector.metadata.compatibleKnowledgePacks.some((id) => knowledge.has(id))
      ) {
        reason = 'INCOMPATIBLE_KNOWLEDGE_PACK';
      }
      if (reason) {
        skipped.push({
          detectorId: detector.metadata.id,
          detectorVersion: detector.metadata.version,
          reasonCode: reason,
        });
      } else {
        eligible.push(detector);
      }
    }
    return Object.freeze({
      eligible: Object.freeze([...eligible]),
      skipped: immutableCopy(skipped) as readonly SkippedDetector[],
    });
  }

  snapshot(): readonly DetectorRegistrySnapshot[] {
    return immutableCopy(this.sorted().map(({ detector, enabled }) => ({
      id: detector.metadata.id,
      displayName: detector.metadata.displayName,
      version: detector.metadata.version,
      priority: detector.metadata.priority,
      enabled,
      deterministic: detector.metadata.deterministic,
    }))) as readonly DetectorRegistrySnapshot[];
  }

  private require(id: string): DetectorRegistration {
    const entry = this.entries.get(id);
    if (!entry) throw new IntelligenceDomainError('INVALID_DETECTOR', 'Detector is not registered.', { id });
    return entry;
  }

  private sorted(): DetectorRegistration[] {
    return [...this.entries.values()].sort((left, right) => (
      left.detector.metadata.priority - right.detector.metadata.priority
      || left.detector.metadata.id.localeCompare(right.detector.metadata.id)
      || left.detector.metadata.version.localeCompare(right.detector.metadata.version)
    ));
  }
}
