import { CircleCheckBig, CircleAlert, Sparkles } from 'lucide-react';
import type { DemoProduct } from '@/types/product';

interface CatalogHealthProps {
  product: DemoProduct;
}

export function CatalogHealth({ product }: CatalogHealthProps) {
  const unresolvedFields = product.truthRows
    .filter((row) => row.status !== 'Verified')
    .map((row) => `${row.field} (${row.status.toLowerCase()})`);

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Catalog Health</div>
          <div className="text-sm text-slate-400">Readiness for Shopify publication</div>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-300">
          {product.catalogHealth.score}% {product.catalogHealth.label}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border-[10px] border-amber-400/70 bg-[#081423] text-2xl font-semibold text-slate-100">
          {product.catalogHealth.score}%
        </div>
        <div className="flex-1 space-y-2">
          {product.catalogHealth.items.map((item) => (
            <div key={item.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
              <span>{item.name}</span>
              {item.status === 'warning' ? <CircleAlert className="h-4 w-4 text-amber-300" /> : <CircleCheckBig className="h-4 w-4 text-emerald-300" />}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-white/5 px-3 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Sparkles className="h-4 w-4 text-amber-300" />
          <span>
            {unresolvedFields.length
              ? `Readiness is reduced by: ${unresolvedFields.join(', ')}`
              : product.catalogHealth.score >= 75 ? 'Ready to publish with reviewed facts' : 'Review missing fields before publishing'}
          </span>
        </div>
        <button className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10">View Full Report</button>
      </div>
    </section>
  );
}
