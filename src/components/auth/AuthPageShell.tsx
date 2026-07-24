import { ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface AuthPageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

export function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
}: AuthPageShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] px-4 py-8 text-slate-50 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(245,185,66,0.15),transparent_34%),radial-gradient(circle_at_85%_75%,rgba(56,189,248,0.09),transparent_35%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#081423]/95 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur lg:grid-cols-[0.9fr_1.1fr]">
          <section className="relative hidden overflow-hidden border-r border-white/10 p-10 lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(245,185,66,0.12),transparent_50%)]" />
            <div className="relative">
              <Link
                href="/landing"
                className="inline-flex items-center gap-3 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold tracking-[0.2em]">LISTINGPILOT AI</span>
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Product Intelligence</span>
                </span>
              </Link>
            </div>

            <div className="relative my-16">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Merchant workspace</p>
              <h2 className="mt-5 max-w-md text-4xl font-semibold leading-tight text-white">
                Turn supplier facts into trustworthy product listings.
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-slate-400">
                Verify product truth, resolve conflicts, and prepare catalog content from one focused workspace.
              </p>
            </div>

            <div className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
              Passwords are protected with Argon2id and server-only database sessions.
            </div>
          </section>

          <section className="p-6 sm:p-10 lg:p-12">
            <Link
              href="/landing"
              className="mb-9 inline-flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 lg:hidden"
            >
              <Sparkles className="h-5 w-5 text-amber-300" aria-hidden="true" />
              LISTINGPILOT AI
            </Link>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">{description}</p>
            <div className="mt-8">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
