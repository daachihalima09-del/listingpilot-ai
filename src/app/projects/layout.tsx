import Link from 'next/link';
import { FolderKanban, Sparkles } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { Sidebar } from '@/components/workspace/Sidebar';

export default function ProjectsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-[#07111f] text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col min-[1700px]:flex-row">
        <Sidebar />
        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
            <Link
              href="/"
              className="inline-flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold">ListingPilot AI</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <FolderKanban className="h-3 w-3" aria-hidden="true" />
                  Saved Projects
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-2">
              <Link
                href="/settings/organization"
                className="rounded-full px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Settings
              </Link>
              <SignOutButton />
            </nav>
          </header>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
