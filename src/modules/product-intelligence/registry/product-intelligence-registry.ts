import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type { ProductCategoryId, ProductIntelligencePack, ProductIntelligencePackId } from '../domain/contracts.ts';
import { ProductIntelligenceError } from '../domain/errors.ts';
import { validateProductIntelligencePack } from './pack-validation.ts';
import { normalizeProductIntelligenceTerm } from './pack-validation.ts';

export class ProductIntelligenceRegistry {
  private readonly byId = new Map<ProductIntelligencePackId, ProductIntelligencePack>();
  private readonly byCategory = new Map<ProductCategoryId, ProductIntelligencePack>();
  private readonly fieldAliasesByPack = new Map<ProductIntelligencePackId, ReadonlyMap<string, string>>();
  private readonly fieldsByPack = new Map<ProductIntelligencePackId, ReadonlyMap<string, ProductIntelligencePack['truthFields'][number]>>();
  private frozen = false;

  register(untrustedPack: ProductIntelligencePack): this {
    if (this.frozen) throw new ProductIntelligenceError('INVALID_PACK', 'The Product Intelligence Registry is immutable.');
    validateProductIntelligencePack(untrustedPack);
    if (this.byId.has(untrustedPack.identity.id)) throw new ProductIntelligenceError('DUPLICATE_PACK_ID', 'Product Intelligence Pack ID is already registered.', { packId: untrustedPack.identity.id });
    if (this.byCategory.has(untrustedPack.identity.categoryId)) throw new ProductIntelligenceError('DUPLICATE_CATEGORY', 'A Product Intelligence Pack already owns this category.', { categoryId: untrustedPack.identity.categoryId });
    const pack = immutableCopy(untrustedPack) as ProductIntelligencePack;
    this.byId.set(pack.identity.id, pack);
    this.byCategory.set(pack.identity.categoryId, pack);
    this.fieldAliasesByPack.set(pack.identity.id, new Map(pack.truthFields.flatMap((field) => [
      field.fieldId,
      field.canonicalName,
      field.displayName,
      ...field.aliases,
    ].map((value) => [normalizeProductIntelligenceTerm(value), field.fieldId] as const))));
    this.fieldsByPack.set(pack.identity.id, new Map(pack.truthFields.map((field) => [field.fieldId, field])));
    return this;
  }

  freeze(): this {
    this.frozen = true;
    return Object.freeze(this);
  }

  getById(id: ProductIntelligencePackId): ProductIntelligencePack | undefined {
    return this.byId.get(id);
  }

  requireById(id: ProductIntelligencePackId): ProductIntelligencePack {
    const pack = this.getById(id);
    if (!pack) throw new ProductIntelligenceError('UNKNOWN_PACK', 'Product Intelligence Pack is not registered.', { packId: id });
    return pack;
  }

  getByCategory(categoryId: ProductCategoryId): ProductIntelligencePack | undefined {
    return this.byCategory.get(categoryId);
  }

  hasCategory(categoryId: ProductCategoryId): boolean {
    return this.byCategory.has(categoryId);
  }

  list(): readonly ProductIntelligencePack[] {
    return Object.freeze([...this.byId.values()].sort((left, right) => left.identity.id.localeCompare(right.identity.id)));
  }

  versions(): Readonly<Record<string, string>> {
    return Object.freeze(Object.fromEntries(this.list().map(({ identity }) => [identity.id, identity.version])));
  }

  resolveFieldId(packId: ProductIntelligencePackId, value: string): string | undefined {
    return this.fieldAliasesByPack.get(packId)?.get(normalizeProductIntelligenceTerm(value));
  }

  getField(packId: ProductIntelligencePackId, fieldId: string) {
    const resolved = this.resolveFieldId(packId, fieldId);
    return resolved ? this.fieldsByPack.get(packId)?.get(resolved) : undefined;
  }

  get size(): number {
    return this.byId.size;
  }
}

export function createProductIntelligenceRegistry(
  packs: readonly ProductIntelligencePack[] = [],
): ProductIntelligenceRegistry {
  const registry = new ProductIntelligenceRegistry();
  for (const pack of packs) registry.register(pack);
  return registry;
}
