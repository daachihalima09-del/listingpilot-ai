import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  EvidenceProviderType,
  EvidenceReliability,
  ExtensionMetadata,
  SourceType,
} from '../domain/types.ts';

export interface EvidenceProvider {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly type: EvidenceProviderType;
  readonly sourceTypes: readonly SourceType[];
  readonly reliability: EvidenceReliability;
  readonly supportedClaims: readonly string[];
  readonly capabilityCompatibility: readonly string[];
  readonly knowledgePackCompatibility: readonly string[];
  readonly metadata: ExtensionMetadata;
  readonly enabled: boolean;
}

export interface EvidenceProviderSnapshot {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly type: EvidenceProviderType;
  readonly enabled: boolean;
}

interface ProviderRegistration {
  readonly provider: EvidenceProvider;
  enabled: boolean;
}

export class EvidenceProviderRegistry {
  private readonly entries = new Map<string, ProviderRegistration>();

  register(provider: EvidenceProvider): void {
    if (!provider.id.trim() || !provider.version.trim()) {
      throw new IntelligenceDomainError('INVALID_IDENTITY', 'Evidence providers require an ID and version.');
    }
    if (this.entries.has(provider.id)) {
      throw new IntelligenceDomainError('DUPLICATE_REGISTRY_ENTRY', 'Evidence provider ID is already registered.', {
        id: provider.id,
      });
    }
    this.entries.set(provider.id, {
      provider: immutableCopy(provider) as EvidenceProvider,
      enabled: provider.enabled,
    });
  }

  get(id: string): EvidenceProvider | undefined {
    return this.entries.get(id)?.provider;
  }

  enable(id: string): void {
    this.require(id).enabled = true;
  }

  disable(id: string): void {
    this.require(id).enabled = false;
  }

  resolve(input: {
    readonly sourceType?: SourceType;
    readonly capabilityId?: string;
    readonly knowledgePackId?: string;
  }): readonly EvidenceProvider[] {
    return this.sorted()
      .filter(({ provider, enabled }) => enabled
        && (!input.sourceType || provider.sourceTypes.includes(input.sourceType))
        && (!input.capabilityId || provider.capabilityCompatibility.includes(input.capabilityId))
        && (!input.knowledgePackId || provider.knowledgePackCompatibility.includes(input.knowledgePackId)))
      .map(({ provider }) => provider);
  }

  snapshot(): readonly EvidenceProviderSnapshot[] {
    return immutableCopy(this.sorted().map(({ provider, enabled }) => ({
      id: provider.id,
      name: provider.name,
      version: provider.version,
      type: provider.type,
      enabled,
    }))) as readonly EvidenceProviderSnapshot[];
  }

  private require(id: string): ProviderRegistration {
    const entry = this.entries.get(id);
    if (!entry) throw new IntelligenceDomainError('INVALID_IDENTITY', 'Evidence provider is not registered.', { id });
    return entry;
  }

  private sorted(): ProviderRegistration[] {
    return [...this.entries.values()].sort((left, right) => left.provider.id.localeCompare(right.provider.id));
  }
}
