import Link from 'next/link';
import { ArrowLeft, Settings, Sparkles } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { SettingsNavigation } from '@/modules/settings/components/SettingsNavigation';

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(245,185,66,0.12),transparent_32%),radial-gradient(circle_at_88%_75%,rgba(56,189,248,0.07),transparent_35%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
          <Link
            href="/"
            className="inline-flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-[0.18em]">LISTINGPILOT AI</span>
              <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Settings</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Dashboard
            </Link>
            <SignOutButton />
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-white/10 bg-[#081423]/90 p-4">
            <div className="mb-5 flex items-center gap-3 px-3 pt-2">
              <Settings className="h-5 w-5 text-amber-300" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-white">Settings</p>
                <p className="text-xs text-slate-500">Tenant management</p>
              </div>
            </div>
            <SettingsNavigation />
          </aside>

          <section className="min-w-0">{children}</section>
        </div>
      </div>
    </main>
  );
}
