import type { DemoProduct } from '@/types/product';

interface RecentAnalysesProps {
  product: DemoProduct;
}

export function RecentAnalyses({ product }: RecentAnalysesProps) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5">
      <div className="text-sm font-semibold text-slate-100">Recent Analyses</div>
      <div className="mt-4 space-y-3">
        {product.analyses.map((item) => (
          <div key={item.title} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                {item.title.includes('Q80D') ? 'TV' : item.title.includes('Dyson') ? 'VAC' : 'AUD'}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.status}</div>
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-300">{item.score}%</div>
          </div>
        ))}
      </div>
    </section>
  );
}
