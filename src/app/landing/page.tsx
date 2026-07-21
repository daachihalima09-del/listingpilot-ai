import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import Link from 'next/link';

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

const workflow = [
  { step: '01', title: 'Import supplier content', description: 'Bring in product specs, PDFs, and notes without losing context.' },
  { step: '02', title: 'Generate the first draft', description: 'Turn raw details into title, description, bullets, and SEO metadata.' },
  { step: '03', title: 'Review and approve', description: 'Check claims, adjust wording, and sign off with confidence.' },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-transparent text-slate-50">
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

      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-sm font-medium text-brand-300">
            <Sparkles className="h-4 w-4" /> Trusted listings, fewer surprises
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Build Shopify listings that are accurate, consistent, and review-ready.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            ListingPilot AI turns supplier information into polished product copy with every important claim tied back to a source.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-brand-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-brand-300">
              Open workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="#workflow" className="rounded-full border border-white/15 bg-white/5 px-5 py-3 font-medium text-slate-100 transition hover:bg-white/10">
              See how it works
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-3 text-sm text-slate-300">
            <li className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Traceable sourcing</li>
            <li className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Approval-friendly editing flow</li>
            <li className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Structured export for Shopify</li>
          </ul>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-brand-400/15 to-white/5 p-6 shadow-soft">
          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Current workspace</p>
                <p className="text-lg font-semibold">Supplier import review</p>
              </div>
              <span className="rounded-full bg-brand-400/20 px-3 py-1 text-sm font-medium text-brand-300">Live</span>
            </div>
            <div className="mt-6 space-y-3">
              {['Bundle claim verified', 'SEO title drafted', 'Approval checkpoint created'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                  <CheckCircle2 className="h-4 w-4 text-brand-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-y border-white/10 bg-white/5 py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-300">Why teams use it</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
              Everything you need to go from raw supplier data to launch-ready content.
            </h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-[1.5rem] border border-white/10 bg-[#0d1729] p-6 shadow-soft">
                <h3 className="text-xl font-semibold">{feature.title}</h3>
                <p className="mt-3 leading-7 text-slate-300">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-300">Workflow</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
              A simple path from supplier file to polished listing.
            </h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {workflow.map((item) => (
              <article key={item.step} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
                <span className="inline-flex rounded-full bg-brand-400/15 px-3 py-1 text-sm font-semibold text-brand-300">
                  {item.step}
                </span>
                <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
                <p className="mt-3 leading-7 text-slate-300">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="launch" className="pb-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col gap-6 rounded-[2rem] border border-white/10 bg-gradient-to-r from-brand-400/12 to-white/5 p-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-300">Ready to launch</p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                Bring structure and trust to the way your team publishes product content.
              </h2>
            </div>
            <Link href="mailto:hello@listingpilot.ai" className="inline-flex items-center justify-center rounded-full bg-brand-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-brand-300">
              Talk to the team
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
