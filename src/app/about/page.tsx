import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

const features = [
  {
    title: 'Claim traceability',
    description: 'Every promise is anchored to a source so your team can verify it quickly.',
  },
  {
    title: 'Approval checkpoints',
    description: 'Review edits before they hit production with a clear audit trail and status workflow.',
  },
  {
    title: 'Consistency control',
    description: 'Keep naming, claims, and formatting aligned across every product listing.',
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-transparent text-slate-50">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#07111f]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-100">
            ListingPilot AI
          </Link>
          <nav className="flex items-center gap-6 text-sm text-slate-300">
            <Link href="/about" className="transition hover:text-white">
              About
            </Link>
            <Link href="/landing" className="transition hover:text-white">
              Landing
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
        <div className="max-w-3xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-sm font-medium text-brand-300">
            <Sparkles className="h-4 w-4" /> Product truth, built for speed
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Turn supplier signals into launch-ready Shopify listings with traceable confidence.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            ListingPilot AI helps teams move from raw supplier context to polished product copy without losing the evidence behind each claim.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-brand-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-brand-300">
              Open the workspace <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-[1.5rem] border border-white/10 bg-[#0d1729] p-6 shadow-soft">
              <h3 className="text-xl font-semibold">{feature.title}</h3>
              <p className="mt-3 leading-7 text-slate-300">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
