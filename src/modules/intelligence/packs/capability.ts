import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type { ExtensionMetadata, IssueCategory } from '../domain/types.ts';

export interface CapabilityPack {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly supportedIssueCategories: readonly IssueCategory[];
  readonly requiredContextFeatures: readonly string[];
  readonly compatibilityMetadata: ExtensionMetadata;
  readonly dependencies: readonly string[];
  readonly extensionMetadata: ExtensionMetadata;
  readonly enabled: boolean;
}

export interface CapabilityPackSnapshot {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly dependencies: readonly string[];
  readonly enabled: boolean;
}

interface CapabilityRegistration {
  readonly pack: CapabilityPack;
  enabled: boolean;
}

export class CapabilityPackRegistry {
  private readonly entries = new Map<string, CapabilityRegistration>();

  register(pack: CapabilityPack): void {
    if (!pack.id.trim() || !pack.version.trim()) {
      throw new IntelligenceDomainError('INVALID_IDENTITY', 'Capability packs require an ID and version.');
    }
    if (this.entries.has(pack.id)) {
      throw new IntelligenceDomainError('DUPLICATE_REGISTRY_ENTRY', 'Capability pack ID is already registered.', {
        id: pack.id,
      });
    }
    const missing = pack.dependencies.filter((id) => !this.entries.has(id));
    if (missing.length) {
      throw new IntelligenceDomainError('MISSING_DEPENDENCY', 'Capability pack dependencies must be registered first.', {
        ids: missing.sort().join(','),
      });
    }
    this.entries.set(pack.id, { pack: immutableCopy(pack) as CapabilityPack, enabled: pack.enabled });
    this.assertAcyclic();
  }

  get(id: string): CapabilityPack | undefined {
    return this.entries.get(id)?.pack;
  }

  enable(id: string): void {
    const entry = this.require(id);
    const disabledDependency = entry.pack.dependencies.find((dependency) => !this.require(dependency).enabled);
    if (disabledDependency) {
      throw new IntelligenceDomainError('MISSING_DEPENDENCY', 'Capability dependency is disabled.', {
        id: disabledDependency,
      });
    }
    entry.enabled = true;
  }

  disable(id: string): void {
    this.require(id).enabled = false;
  }

  resolve(ids?: readonly string[]): readonly CapabilityPack[] {
    const allowed = ids ? new Set(ids) : null;
    return this.orderedEntries()
      .filter(({ pack, enabled }) => enabled && (!allowed || allowed.has(pack.id)))
      .map(({ pack }) => pack);
  }

  compatibleWith(metadata: Readonly<Record<string, unknown>>): readonly CapabilityPack[] {
    return this.orderedEntries()
      .filter(({ pack, enabled }) => enabled && Object.entries(metadata).every(
        ([key, value]) => pack.compatibilityMetadata[key] === value,
      ))
      .map(({ pack }) => pack);
  }

  snapshot(): readonly CapabilityPackSnapshot[] {
    return immutableCopy(this.orderedEntries().map(({ pack, enabled }) => ({
      id: pack.id,
      name: pack.name,
      version: pack.version,
      dependencies: pack.dependencies,
      enabled,
    }))) as readonly CapabilityPackSnapshot[];
  }

  private require(id: string): CapabilityRegistration {
    const entry = this.entries.get(id);
    if (!entry) throw new IntelligenceDomainError('INVALID_IDENTITY', 'Capability pack is not registered.', { id });
    return entry;
  }

  private orderedEntries(): CapabilityRegistration[] {
    const result: CapabilityRegistration[] = [];
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visited.has(id)) return;
      const entry = this.require(id);
      for (const dependency of [...entry.pack.dependencies].sort()) visit(dependency);
      visited.add(id);
      result.push(entry);
    };
    for (const id of [...this.entries.keys()].sort()) visit(id);
    return result;
  }

  private assertAcyclic(): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) {
        throw new IntelligenceDomainError('MISSING_DEPENDENCY', 'Capability dependencies cannot contain a cycle.');
      }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependency of this.require(id).pack.dependencies) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of this.entries.keys()) visit(id);
  }
}
