import type { Metadata } from 'next';
import { serverListingCalibrationService } from '@/modules/listing-calibration/application/calibration-service.server';
import { CalibrationWorkspace } from '@/modules/listing-calibration/review/CalibrationWorkspace';
import { BusinessProfileSettingsPage } from '@/modules/settings/business-profile/BusinessProfileSettingsPage';
import { resolveBusinessProfileSettingsTenant } from '@/modules/settings/business-profile/page-context.server';

export const metadata: Metadata = {
  title: 'NEOVIX Calibration Settings | ListingPilot AI',
};

interface Props {
  searchParams: Promise<{
    fixtureId?: string | string[];
    workspaceId?: string | string[];
  }>;
}

export default async function ListingCalibrationPage({ searchParams }: Props) {
  const query = await searchParams;
  const { user, tenant, workspace } = await resolveBusinessProfileSettingsTenant(
    Promise.resolve(query),
  );
  const access = { actorUserId: user.id, organizationId: tenant.organization.id, workspaceId: workspace.id, role: tenant.role } as const;
  const [fixtures, reports, proposals] = await Promise.all([
    serverListingCalibrationService.listFixtures(access, workspace.id),
    serverListingCalibrationService.listReports(access, workspace.id),
    serverListingCalibrationService.listProposals(access, workspace.id),
  ]);
  return (
    <BusinessProfileSettingsPage
      eyebrow="Business Profile - Advanced"
      title="NEOVIX Calibration"
      description="Review calibration fixtures, reports, and proposed rule changes without altering existing saved drafts."
    >
      <CalibrationWorkspace
        workspaceId={workspace.id}
        canManage={tenant.role === 'OWNER'}
        initialFixtures={fixtures}
        initialReports={reports}
        initialProposals={proposals}
        openFixtureId={typeof query.fixtureId === 'string' ? query.fixtureId : undefined}
      />
    </BusinessProfileSettingsPage>
  );
}
