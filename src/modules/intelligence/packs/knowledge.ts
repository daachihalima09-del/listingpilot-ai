import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type { ExtensionMetadata, IssueCategory, ValueType } from '../domain/types.ts';

export interface KnowledgeFieldMetadata {
  readonly key: string;
  readonly label: string;
  readonly valueType: ValueType;
  readonly unit?: string;
  readonly metadata: ExtensionMetadata;
}

export interface KnowledgePack {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly supportedCategories: readonly string[];
  readonly categoryAliases: Readonly<Record<string, readonly string[]>>;
  readonly specificationVocabulary: readonly KnowledgeFieldMetadata[];
  readonly requiredFields: readonly KnowledgeFieldMetadata[];
  readonly optionalFields: readonly KnowledgeFieldMetadata[];
  readonly terminology: Readonly<Record<string, string>>;
  readonly unitNormalization: Readonly<Record<string, string>>;
  readonly confidenceWeights: Readonly<Record<string, number>>;
  readonly dependencies: readonly string[];
  readonly validationMetadata: ExtensionMetadata;
  readonly compatibilityMetadata: ExtensionMetadata;
  readonly extensionMetadata: ExtensionMetadata;
  readonly supportedIssueCategories: readonly IssueCategory[];
  readonly enabled: boolean;
}

export interface KnowledgePackSnapshot {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
}

interface KnowledgeRegistration {
  readonly pack: KnowledgePack;
  enabled: boolean;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export class KnowledgePackRegistry {
  private readonly entries = new Map<string, KnowledgeRegistration>();

  register(pack: KnowledgePack): void {
    if (!pack.id.trim() || !pack.version.trim()) {
      throw new IntelligenceDomainError('INVALID_IDENTITY', 'Knowledge packs require an ID and version.');
    }
    if (this.entries.has(pack.id)) {
      throw new IntelligenceDomainError('DUPLICATE_REGISTRY_ENTRY', 'Knowledge pack ID is already registered.', {
        id: pack.id,
      });
    }
    const missing = pack.dependencies.filter((id) => !this.entries.has(id));
    if (missing.length) {
      throw new IntelligenceDomainError('MISSING_DEPENDENCY', 'Knowledge pack dependencies must be registered first.', {
        ids: missing.sort().join(','),
      });
    }
    this.entries.set(pack.id, { pack: immutableCopy(pack) as KnowledgePack, enabled: pack.enabled });
  }

  get(id: string): KnowledgePack | undefined {
    const entry = this.entries.get(id);
    return entry?.pack;
  }

  enable(id: string): void {
    this.require(id).enabled = true;
  }

  disable(id: string): void {
    this.require(id).enabled = false;
  }

  matchCategory(category: string): readonly KnowledgePack[] {
    const wanted = normalized(category);
    return this.sortedEntries()
      .filter(({ pack, enabled }) => enabled && (
        pack.supportedCategories.some((item) => normalized(item) === wanted)
        || Object.entries(pack.categoryAliases).some(([canonical, aliases]) => (
          normalized(canonical) === wanted
          || aliases.some((alias) => normalized(alias) === wanted)
        ))
      ))
      .map(({ pack }) => pack);
  }

  compatibleWith(metadata: Readonly<Record<string, unknown>>): readonly KnowledgePack[] {
    return this.sortedEntries()
      .filter(({ pack, enabled }) => enabled && Object.entries(metadata).every(
        ([key, value]) => pack.compatibilityMetadata[key] === value,
      ))
      .map(({ pack }) => pack);
  }

  resolve(ids?: readonly string[]): readonly KnowledgePack[] {
    const allowed = ids ? new Set(ids) : null;
    return this.orderedEntries()
      .filter(({ pack, enabled }) => enabled && (!allowed || allowed.has(pack.id)))
      .map(({ pack }) => pack);
  }

  snapshot(): readonly KnowledgePackSnapshot[] {
    return immutableCopy(this.sortedEntries().map(({ pack, enabled }) => ({
      id: pack.id,
      name: pack.name,
      version: pack.version,
      enabled,
    }))) as readonly KnowledgePackSnapshot[];
  }

  private require(id: string): KnowledgeRegistration {
    const entry = this.entries.get(id);
    if (!entry) throw new IntelligenceDomainError('INVALID_IDENTITY', 'Knowledge pack is not registered.', { id });
    return entry;
  }

  private sortedEntries(): KnowledgeRegistration[] {
    return [...this.entries.values()].sort((left, right) => left.pack.id.localeCompare(right.pack.id));
  }

  private orderedEntries(): KnowledgeRegistration[] {
    const result: KnowledgeRegistration[] = [];
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
}
