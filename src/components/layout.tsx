import Link from 'next/link';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#07111f]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-100">
            ListingPilot AI
          </Link>
          <nav className="flex items-center gap-6 text-sm text-slate-300">
            <Link href="#features" className="transition hover:text-white">
              Features
            </Link>
            <Link href="#workflow" className="transition hover:text-white">
              Workflow
            </Link>
            <Link href="#launch" className="transition hover:text-white">
              Launch
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
