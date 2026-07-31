import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';

export default function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(245,185,66,0.13),transparent_32%),radial-gradient(circle_at_90%_82%,rgba(16,185,129,0.08),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
          <Link
            href="/"
            className="inline-flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-[0.18em]">
                LISTINGPILOT AI
              </span>
              <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                Store setup
              </span>
            </span>
          </Link>
          <SignOutButton />
        </header>
        {children}
      </div>
    </main>
  );
}
