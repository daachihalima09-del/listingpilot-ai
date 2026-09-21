import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  businessProfileSettingsPath,
  businessProfileSettingsRoutes,
  merchantProfileSaveDestination,
} from './routes.ts';
import {
  parseTenantRouteContext,
  tenantAwarePath,
  TenantRouteContextError,
} from '../../tenancy/tenant-route-context.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const workspaceId = '11111111-1111-4111-8111-111111111111';

const requiredRoutes = [
  ['catalog', '/settings/business-profile/catalog', 'Catalog Profile'],
  ['listing-standard', '/settings/business-profile/listing-standard', 'Listing Standard'],
  ['listing', '/settings/business-profile/listing', 'Listing Style'],
  ['seo', '/settings/business-profile/seo', 'SEO Profile'],
  ['publishing', '/settings/business-profile/publishing', 'Publishing Profile'],
  ['ai', '/settings/business-profile/ai', 'AI Profile'],
  ['calibration', '/settings/business-profile/listing/calibration', 'NEOVIX Calibration'],
] as const;

test('exposes every Merchant Business Profile section through permanent Settings routes', () => {
  assert.deepEqual(
    businessProfileSettingsRoutes.map(({ id, href, label }) => [id, href, label]),
    requiredRoutes,
  );
  for (const [, route] of requiredRoutes) {
    const page = `${root}/src/app${route}/page.tsx`;
    assert.equal(existsSync(page), true, `${route} should have a page`);
  }
});

test('Settings saves remain in Settings while onboarding keeps its existing progression', () => {
  assert.equal(
    merchantProfileSaveDestination({
      section: 'listing-standard',
      surface: 'settings',
      workspaceId,
    }),
    businessProfileSettingsPath('listing', workspaceId),
  );
  for (const section of ['catalog', 'listing', 'seo', 'publishing', 'ai'] as const) {
    assert.equal(
      merchantProfileSaveDestination({ section, surface: 'settings', workspaceId }),
      businessProfileSettingsPath(section, workspaceId),
    );
  }
  assert.match(
    merchantProfileSaveDestination({
      section: 'listing-standard',
      surface: 'onboarding',
      workspaceId,
    }),
    /^\/onboarding\/listing-profile\?/,
  );
  assert.match(
    merchantProfileSaveDestination({ section: 'seo', surface: 'onboarding', workspaceId }),
    /^\/onboarding\/publishing-profile\?/,
  );
  assert.match(
    merchantProfileSaveDestination({ section: 'publishing', surface: 'onboarding', workspaceId }),
    /^\/onboarding\/ai-profile\?/,
  );
  assert.match(
    merchantProfileSaveDestination({ section: 'ai', surface: 'onboarding', workspaceId }),
    /^\/projects\/new\?/,
  );
});

test('Settings pages reuse existing forms, services, persistence and tenant access', () => {
  const pageSources = requiredRoutes.map(([, route]) => (
    readFileSync(`${root}/src/app${route}/page.tsx`, 'utf8')
  ));
  const joined = pageSources.join('\n');

  for (const form of [
    'MerchantCatalogProfileForm',
    'ListingStandardSelector',
    'MerchantListingProfileForm',
    'MerchantSeoProfileForm',
    'MerchantPublishingProfileForm',
    'MerchantAiProfileForm',
    'CalibrationWorkspace',
  ]) {
    assert.match(joined, new RegExp(form));
  }
  assert.match(joined, /resolveBusinessProfileSettingsTenant/);
  assert.match(joined, /resolveMerchant(?:Catalog|Listing)ProfileAccess/);
  assert.doesNotMatch(joined, /onboardingPathIfRequired|redirect\(['"]\//);
  assert.doesNotMatch(joined, /prisma\.|saveSection\(|listingDraft|listing-craft/);
});

test('Listing Standard warns that existing drafts remain unchanged', () => {
  const standardPage = readFileSync(
    `${root}/src/app/settings/business-profile/listing-standard/page.tsx`,
    'utf8',
  );
  assert.match(
    standardPage,
    /Changes apply to future generated listings\. Existing saved drafts will not be modified\./,
  );
  const standardService = readFileSync(
    `${root}/src/modules/onboarding/listing-profile/listing-profile-service.ts`,
    'utf8',
  );
  assert.match(standardService, /saveSection/);
  assert.match(standardService, /savePermanentSection/);
  assert.doesNotMatch(standardService, /listingDraft|craftPack|project\.(?:update|delete)/i);

  const selector = readFileSync(
    `${root}/src/modules/onboarding/listing-profile/ListingStandardSelector.tsx`,
    'utf8',
  );
  assert.match(selector, /\/api\/settings\/business-profile\/listing-standard/);
  const settingsRoute = readFileSync(
    `${root}/src/app/api/settings/business-profile/listing-standard/route.ts`,
    'utf8',
  );
  assert.match(settingsRoute, /selectListingStandard[\s\S]*'settings'/);
  const onboardingRoute = readFileSync(
    `${root}/src/app/api/onboarding/listing-profile/route.ts`,
    'utf8',
  );
  assert.doesNotMatch(onboardingRoute, /surface|savePermanentSection/);
});

test('OWNER-only mutation and hard tenant isolation remain server-enforced', () => {
  const listingApi = readFileSync(
    `${root}/src/app/api/onboarding/listing-profile/route.ts`,
    'utf8',
  );
  const catalogApi = readFileSync(
    `${root}/src/app/api/onboarding/catalog-profile/route.ts`,
    'utf8',
  );
  const access = readFileSync(
    `${root}/src/modules/onboarding/listing-profile/listing-profile-context.server.ts`,
    'utf8',
  );
  assert.match(listingApi, /resolveMerchantListingProfileAccess\([\s\S]*true/);
  assert.match(catalogApi, /requireOwner: true/);
  assert.match(access, /tenant\.role !== 'OWNER'/);
  assert.match(access, /403/);
  assert.match(access, /404/);
});

test('Settings navigation is grouped, exact-active, keyboard accessible and responsive at 390px', () => {
  const navigation = readFileSync(
    `${root}/src/modules/settings/components/SettingsNavigation.tsx`,
    'utf8',
  );
  assert.match(navigation, /Business Profile/);
  assert.match(navigation, /businessProfileSettingsRoutes/);
  assert.match(navigation, /pathname === route\.href/);
  assert.match(navigation, /grid-cols-2/);
  assert.match(navigation, /sm:grid-cols-3/);
  assert.match(navigation, /focus-visible:ring-2/);
  assert.doesNotMatch(navigation, /startsWith\(`\$\{route\.href\}\//);
});

test('Settings routes preserve explicit organization and workspace context', () => {
  const organizationId = '22222222-2222-4222-8222-222222222222';
  assert.equal(
    tenantAwarePath('/settings/shopify', { organizationId, workspaceId }),
    `/settings/shopify?organizationId=${organizationId}&workspaceId=${workspaceId}`,
  );
  assert.deepEqual(parseTenantRouteContext({ organizationId, workspaceId }), {
    organizationId,
    workspaceId,
  });
  assert.throws(
    () => parseTenantRouteContext({ organizationId: [organizationId] }),
    TenantRouteContextError,
  );

  const navigation = readFileSync(
    `${root}/src/modules/settings/components/SettingsNavigation.tsx`,
    'utf8',
  );
  const projectLayout = readFileSync(`${root}/src/app/projects/layout.tsx`, 'utf8');
  const sidebar = readFileSync(`${root}/src/components/workspace/Sidebar.tsx`, 'utf8');
  assert.match(navigation, /TenantAwareLink/);
  assert.match(projectLayout, /TenantAwareLink/);
  assert.match(sidebar, /TenantAwareLink/);
});

test('Shopify Settings and connect requests use the same explicit tenant', () => {
  const page = readFileSync(`${root}/src/app/settings/shopify/page.tsx`, 'utf8');
  const panel = readFileSync(
    `${root}/src/modules/shopify/components/ShopifySettingsPanel.tsx`,
    'utf8',
  );
  const connect = readFileSync(`${root}/src/app/api/shopify/connect/route.ts`, 'utf8');
  assert.match(page, /parseTenantRouteContext\(query\)/);
  assert.match(page, /workspaceId: tenant\.workspace\.id/);
  assert.match(panel, /shop: normalized\.data,[\s\S]*\.\.\.tenantContext/);
  assert.match(connect, /resolveShopifyConnectTenant/);
  assert.match(connect, /workspaceId: tenant\.workspace\.id/);
});
