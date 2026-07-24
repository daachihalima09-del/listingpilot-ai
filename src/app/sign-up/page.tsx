import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { auth } from '@/modules/auth/server/auth';
import { getSafeCallbackPath } from '@/modules/auth/server/redirects';

export const metadata: Metadata = {
  title: 'Create account | ListingPilot AI',
  description: 'Create your ListingPilot AI merchant workspace.',
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
      title="Create your merchant account"
      description="Your organization and default truth workspace will be ready immediately."
    >
      <SignUpForm callbackUrl={callbackUrl} />
    </AuthPageShell>
  );
}
