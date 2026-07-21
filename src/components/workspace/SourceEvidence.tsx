import { ShieldCheck } from 'lucide-react';
import type { SourceEvidenceItem } from '@/types/product';

interface SourceEvidenceProps {
  sources: SourceEvidenceItem[];
}

export function SourceEvidence({ sources }: SourceEvidenceProps) {
  const confidence = sources.length
    ? Math.round(sources.reduce((total, source) => total + source.confidence, 0) / sources.length)
    : 0;
  const isUserInput = sources.length === 1 && sources[0]?.name === 'Pasted specifications';

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Source Evidence</div>
          <div className="text-sm text-slate-400">
            {isUserInput ? 'User-supplied input and analysis confidence' : 'Independent references and verification strength'}
          </div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">{confidence}%</div>
      </div>
      <div className="mt-4 space-y-3">
        {sources.map((source) => (
          <div key={source.name} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-300" />
              <div className="min-w-0">
                <div className="truncate text-sm text-slate-200" title={source.name}>{source.name}</div>
                <div className="text-xs text-slate-500">{source.type}</div>
              </div>
            </div>
            <div className="shrink-0 text-sm text-slate-300">{source.confidence}%</div>
          </div>
        ))}
      </div>
    </section>
  );
}
