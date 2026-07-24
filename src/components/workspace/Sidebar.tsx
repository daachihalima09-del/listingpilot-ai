import Link from 'next/link';
import { Blocks, Boxes, Building2, FileSpreadsheet, LayoutGrid, PanelLeft, Settings, Sparkles, SquareCheckBig } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: LayoutGrid, active: true },
  { label: 'Catalog', icon: Blocks },
  { label: 'Truth Workspace', icon: Sparkles },
  { label: 'Review', icon: SquareCheckBig },
  { label: 'Export', icon: FileSpreadsheet },
];

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#060b14] p-6 min-[1700px]:flex min-[1700px]:flex-col">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
            <PanelLeft className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.25em] text-slate-100">ListingPilot AI</p>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Product Intelligence</p>
          </div>
        </div>
      </div>

      <nav className="mt-10 space-y-2">
        {navItems.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition ${
              active ? 'bg-amber-400/15 text-amber-200 shadow-[0_0_0_1px_rgba(255,199,76,0.2)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}

        <div className="mt-5 border-t border-white/10 pt-5">
          <div className="mb-2 flex items-center gap-2 px-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Settings
          </div>
          <Link
            href="/settings/organization"
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Organization
          </Link>
          <Link
            href="/settings/workspace"
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
          >
            <Boxes className="h-4 w-4" aria-hidden="true" />
            Workspace
          </Link>
        </div>
      </nav>

      <div className="mt-auto rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold text-slate-100">Truth Workspace</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Create verified Shopify catalogs from supplier truth and independent evidence.
        </p>
      </div>
    </aside>
  );
}
