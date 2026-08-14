export const businessProfileSettingsRoutes = [
  {
    id: 'catalog',
    href: '/settings/business-profile/catalog',
    label: 'Catalog Profile',
  },
  {
    id: 'listing-standard',
    href: '/settings/business-profile/listing-standard',
    label: 'Listing Standard',
  },
  {
    id: 'listing',
    href: '/settings/business-profile/listing',
    label: 'Listing Style',
  },
  {
    id: 'seo',
    href: '/settings/business-profile/seo',
    label: 'SEO Profile',
  },
  {
    id: 'publishing',
    href: '/settings/business-profile/publishing',
    label: 'Publishing Profile',
  },
  {
    id: 'ai',
    href: '/settings/business-profile/ai',
    label: 'AI Profile',
  },
  {
    id: 'calibration',
    href: '/settings/business-profile/listing/calibration',
    label: 'NEOVIX Calibration',
    advanced: true,
  },
] as const;

export type BusinessProfileSettingsRouteId =
  typeof businessProfileSettingsRoutes[number]['id'];

export type MerchantProfileSurface = 'onboarding' | 'settings';

const settingsPathBySection = Object.fromEntries(
  businessProfileSettingsRoutes.map(({ id, href }) => [id, href]),
) as Record<BusinessProfileSettingsRouteId, string>;

function withWorkspace(path: string, workspaceId: string): string {
  return `${path}?${new URLSearchParams({ workspaceId })}`;
}

export function businessProfileSettingsPath(
  section: BusinessProfileSettingsRouteId,
  workspaceId?: string,
): string {
  const path = settingsPathBySection[section];
  return workspaceId ? withWorkspace(path, workspaceId) : path;
}

export function merchantProfileSaveDestination(input: {
  section: Exclude<BusinessProfileSettingsRouteId, 'calibration'>;
  surface: MerchantProfileSurface;
  workspaceId: string;
  organizationId?: string;
}): string {
  if (input.surface === 'settings') {
    const target = input.section === 'listing-standard'
      ? 'listing'
      : input.section;
    return businessProfileSettingsPath(target, input.workspaceId);
  }

  if (input.section === 'listing-standard') {
    return withWorkspace('/onboarding/listing-profile', input.workspaceId);
  }
  if (input.section === 'seo') {
    return withWorkspace('/onboarding/publishing-profile', input.workspaceId);
  }
  if (input.section === 'publishing') {
    return withWorkspace('/onboarding/ai-profile', input.workspaceId);
  }
  const search = new URLSearchParams({ workspaceId: input.workspaceId });
  if (input.organizationId) search.set('organizationId', input.organizationId);
  return `/projects/new?${search}`;
}
