import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { SignInForm } from '@/components/auth/SignInForm';
import { auth } from '@/modules/auth/server/auth';
import { getSafeCallbackPath } from '@/modules/auth/server/redirects';

export const metadata: Metadata = {
  title: 'Sign in | ListingPilot AI',
  description: 'Sign in to your ListingPilot AI merchant workspace.',
};

interface SignInPageProps {
  searchParams: Promise<{
    callbackUrl?: string | string[];
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
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
      eyebrow="Welcome back"
      title="Sign in to your workspace"
      description="Continue building verified, merchant-ready product listings."
    >
      <SignInForm callbackUrl={callbackUrl} />
    </AuthPageShell>
  );
}
