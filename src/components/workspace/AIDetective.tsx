import { AlertTriangle, ArrowDown, CheckCircle2, Sparkles } from 'lucide-react';
import type { DemoProduct } from '@/types/product';

interface AIDetectiveProps {
  product: DemoProduct;
  hasConflict: boolean;
  conflictResolved: boolean;
  onResolve: () => void;
  visibleSourcesCount: number;
  recommendationConfidence: number;
  showRecommendation: boolean;
}

export function AIDetective({
  product,
  hasConflict,
  conflictResolved,
  onResolve,
  visibleSourcesCount,
  recommendationConfidence,
  showRecommendation,
}: AIDetectiveProps) {
  const conflictConfidence = product.truthRows.find((row) => row.field === product.conflict.label)?.confidence ?? recommendationConfidence;
  const isSamsungDemo = product.brand === 'Samsung' && product.model === 'Q80D';
  const noConflict = !hasConflict && !conflictResolved;
  const sources = isSamsungDemo
    ? [
        { label: 'Samsung Official', value: '120Hz • 98%' },
        { label: 'Amazon Listing', value: '144Hz • 71%' },
        { label: 'LG Official', value: '120Hz • 94%' },
      ]
    : [
        { label: 'Specification A', value: `${product.conflict.official} • ${conflictConfidence}%` },
        { label: 'Specification B', value: `${product.conflict.amazon} • ${conflictConfidence}%` },
        { label: 'Recommended value', value: `${product.conflict.lg} • ${recommendationConfidence}%` },
      ];

  return (
    <section className={`rounded-[1.75rem] border p-5 ${conflictResolved || noConflict ? 'border-emerald-400/20 bg-[#09130e]' : 'border-rose-400/20 bg-[#140d13]'}`}>
      <div className={`flex items-center gap-2 text-sm font-semibold ${conflictResolved || noConflict ? 'text-emerald-300' : 'text-rose-300'}`}>
        {noConflict ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {conflictResolved ? 'Conflict resolved' : noConflict ? 'No conflicts detected' : 'Conflict detected'}
      </div>
      <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-[#081423] p-4">
        {noConflict ? (
          <p className="text-sm leading-6 text-slate-300">No contradictory values were found in the current product input.</p>
        ) : (
          <div className="space-y-3">
            {sources.slice(0, visibleSourcesCount).map((source, index) => (
              <div key={source.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{source.label}</div>
                    <div className="mt-2 text-lg font-semibold text-slate-100">{source.value}</div>
                  </div>
                  {index < visibleSourcesCount - 1 ? <ArrowDown className="h-4 w-4 text-amber-300" /> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Verification reasoning</div>
        <div className="mt-3 space-y-2">
          {product.truthRows.slice(0, 6).map((row) => (
            <div key={row.field} className="text-sm leading-5 text-slate-300">
              <span className="font-medium text-slate-100">{row.field}:</span> {row.reasoning ?? `${row.status} at ${row.confidence}% confidence based on available evidence.`}
            </div>
          ))}
        </div>
      </div>

      {(showRecommendation || conflictResolved) ? (
        <div className={`mt-5 rounded-[1.25rem] border p-4 ${conflictResolved ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-amber-400/20 bg-amber-400/10'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <Sparkles className="h-4 w-4" /> AI Recommendation: {product.conflict.recommendation}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {conflictResolved ? 'The recommended value is now selected and preserved through review and export.' : product.conflict.explanation}
          </p>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Confidence</div>
              <div className="text-3xl font-semibold text-slate-100">{recommendationConfidence}%</div>
            </div>
            <button
              onClick={onResolve}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${conflictResolved ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300' : 'bg-amber-400 text-slate-950 hover:bg-amber-300'}`}
            >
              {conflictResolved ? <CheckCircle2 className="h-4 w-4" /> : null}
              {conflictResolved ? 'Conflict Resolved' : 'Resolve Conflict'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
