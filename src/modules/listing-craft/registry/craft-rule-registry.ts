import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type { ListingCraftRulePack } from '../domain/contracts.ts';
import { ListingCraftError } from '../domain/errors.ts';
import { validateCraftPack } from '../validation/pack-validation.ts';

export class ListingCraftRuleRegistry {
  private readonly byId = new Map<string, ListingCraftRulePack>();
  private readonly byStandard = new Map<string, ListingCraftRulePack>();
  private frozen = false;

  register(input: ListingCraftRulePack): this {
    if (this.frozen) throw new ListingCraftError('INVALID_CRAFT_PACK', 'The default Listing Craft registry is immutable.');
    const pack = immutableCopy(validateCraftPack(input)) as ListingCraftRulePack;
    if (this.byId.has(pack.id)) throw new ListingCraftError('DUPLICATE_CRAFT_PACK', `Craft Pack ${pack.id} is already registered.`);
    for (const standardId of pack.supportedListingStandardIds) {
      if (this.byStandard.has(standardId)) throw new ListingCraftError('DUPLICATE_STANDARD_OWNERSHIP', `Listing Standard ${standardId} already owns a Craft Pack.`);
    }
    this.byId.set(pack.id, pack);
    for (const standardId of pack.supportedListingStandardIds) this.byStandard.set(standardId, pack);
    return this;
  }

  freeze(): this { this.frozen = true; return this; }
  getById(id: string): ListingCraftRulePack | null { return this.byId.get(id) ?? null; }
  getByListingStandard(id: string): ListingCraftRulePack | null { return this.byStandard.get(id) ?? null; }
  list(): readonly ListingCraftRulePack[] { return Object.freeze([...this.byId.values()]); }
  versions(): Readonly<Record<string, string>> { return Object.freeze(Object.fromEntries(this.list().map(({ id, version }) => [id, version]))); }
}
