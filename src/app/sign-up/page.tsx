import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { auth } from '@/modules/auth/server/auth';
import { getSafeCallbackPath } from '@/modules/auth/server/redirects';

export const metadata: Metadata = {
  title: 'Activate early access | ListingPilot AI',
  description: 'Activate an approved ListingPilot AI early-access merchant workspace.',
};

interface SignUpPageProps {
  searchParams: Promise<{
    callbackUrl?: string | string[];
  }>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const session = await auth();
  if (session?.user) {
    redirect('/');
  }

  const parameters = await searchParams;
  const callbackUrl = getSafeCallbackPath(
    typeof parameters.callbackUrl === 'string'
      ? parameters.callbackUrl
      : undefined,
  );

  return (
    <AuthPageShell
      eyebrow="Start your workspace"
      title="Activate your merchant account"
      description="Early access is limited to approved merchants. Your organization and default workspace will be created after activation."
    >
      <SignUpForm callbackUrl={callbackUrl} />
    </AuthPageShell>
  );
}
