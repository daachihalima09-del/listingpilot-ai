import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ListingCraftError,
  createListingCraftRegistry,
  defaultListingCraftRegistry,
  getCraftPackForListingStandard,
  neovixCraftRulePack,
  validateCraftPack,
  type ListingCraftRulePack,
} from '../index.ts';

test('registers immutable NEOVIX v1.2.0 and resolves it only for the NEOVIX standard', () => {
  const pack = getCraftPackForListingStandard('NEOVIX');
  assert.equal(pack?.id, 'neovix');
  assert.equal(pack?.version, '1.2.0');
  assert.equal(Object.isFrozen(pack), true);
  assert.equal(Object.isFrozen(pack?.titleRules.componentOrder), true);
  assert.equal(getCraftPackForListingStandard('MARKETPLACE'), null);
  assert.equal(getCraftPackForListingStandard('LUXURY_RETAIL'), null);
  assert.deepEqual(defaultListingCraftRegistry.versions(), { neovix: '1.2.0' });
});

test('independent registries accept generic future packs without core switches', () => {
  const fake = structuredClone(neovixCraftRulePack) as unknown as ListingCraftRulePack;
  Object.assign(fake, { id: 'future-pack', displayName: 'Future Pack', supportedListingStandardIds: ['FUTURE_STANDARD'] });
  const registry = createListingCraftRegistry().register(fake);
  assert.equal(registry.getByListingStandard('FUTURE_STANDARD')?.id, 'future-pack');
  assert.equal(registry.getById('future-pack')?.displayName, 'Future Pack');
});

test('rejects duplicate IDs, duplicate standard ownership, unsafe packs and frozen mutation', () => {
  const registry = createListingCraftRegistry().register(neovixCraftRulePack);
  assert.throws(() => registry.register(neovixCraftRulePack), (error: unknown) => error instanceof ListingCraftError && error.code === 'DUPLICATE_CRAFT_PACK');
  const duplicateOwner = structuredClone(neovixCraftRulePack) as unknown as ListingCraftRulePack;
  Object.assign(duplicateOwner, { id: 'duplicate-owner' });
  assert.throws(() => registry.register(duplicateOwner), (error: unknown) => error instanceof ListingCraftError && error.code === 'DUPLICATE_STANDARD_OWNERSHIP');
  const unsafe = structuredClone(neovixCraftRulePack) as unknown as ListingCraftRulePack;
  Object.assign(unsafe.identityRules, { vendorMayImplyBrand: true });
  assert.throws(() => validateCraftPack(unsafe), (error: unknown) => error instanceof ListingCraftError && error.code === 'INVALID_CRAFT_PACK');
  assert.throws(() => defaultListingCraftRegistry.register(neovixCraftRulePack), ListingCraftError);
});
