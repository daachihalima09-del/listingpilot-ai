import { MerchantPreferenceError } from './errors.ts';
import type { MerchantPreferenceSectionId } from './section-ids.ts';

export interface MerchantPreferenceAccess {
  actorUserId: string;
  organizationId: string;
  workspaceId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export function requireMerchantPreferenceWorkspaceAccess(
  access: MerchantPreferenceAccess,
  workspaceId: string,
): void {
  if (access.workspaceId !== workspaceId) {
    throw new MerchantPreferenceError(
      'WORKSPACE_FORBIDDEN',
      404,
      'The requested merchant preferences are unavailable.',
    );
  }
}

export function requireMerchantPreferenceOwner(
  access: MerchantPreferenceAccess,
  workspaceId: string,
): void {
  requireMerchantPreferenceWorkspaceAccess(access, workspaceId);
  if (access.role !== 'OWNER') {
    throw new MerchantPreferenceError(
      'WORKSPACE_FORBIDDEN',
      403,
      'Only the workspace owner can edit merchant preferences.',
    );
  }
}

export function merchantPreferenceSectionRoute(
  sectionId: MerchantPreferenceSectionId,
  workspaceId: string,
): string | null {
  if (sectionId === 'catalog') {
    return `/onboarding/catalog-profile?${new URLSearchParams({ workspaceId })}`;
  }
  if (sectionId === 'listing') {
    return `/onboarding/listing-standard?${new URLSearchParams({ workspaceId })}`;
  }
  if (sectionId === 'seo') {
    return `/onboarding/seo-profile?${new URLSearchParams({ workspaceId })}`;
  }
  if (sectionId === 'publishing') {
    return `/onboarding/publishing-profile?${new URLSearchParams({ workspaceId })}`;
  }
  if (sectionId === 'ai') {
    return `/onboarding/ai-profile?${new URLSearchParams({ workspaceId })}`;
  }
  return null;
}

export function merchantPreferenceAccessModel(
  role: MerchantPreferenceAccess['role'],
) {
  return Object.freeze({
    canView: true,
    canEdit: role === 'OWNER',
    activeRoutes: Object.freeze(['catalog', 'listing', 'seo', 'publishing', 'ai'] as const),
  });
}
