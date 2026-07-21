import { CheckCircle2, CircleAlert, TriangleAlert } from 'lucide-react';
import type { TruthRow } from '@/types/product';

interface ProductTruthTableProps {
  rows: TruthRow[];
  visibleCount: number;
}

export function ProductTruthTable({ rows, visibleCount }: ProductTruthTableProps) {
  const visibleRows = rows.slice(0, visibleCount);

  const renderStatus = (row: TruthRow) => {
    if (row.status === 'Verified') {
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-2.5 py-1 text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Verified
        </span>
      );
    }

    if (row.status === 'Conflict') {
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-2.5 py-1 text-rose-300">
          <CircleAlert className="h-3.5 w-3.5" /> Conflict
        </span>
      );
    }

    if (row.status === 'Likely') {
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-sky-400/10 px-2.5 py-1 text-sky-200">
          <TriangleAlert className="h-3.5 w-3.5" /> Likely
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-2.5 py-1 text-amber-300">
        <TriangleAlert className="h-3.5 w-3.5" /> Missing
      </span>
    );
  };

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Product Truth</div>
          <div className="text-sm text-slate-400">Structured evidence from the analysis stream</div>
        </div>
        <div className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-amber-300">Live</div>
      </div>

      <div className="mt-4 space-y-3 md:hidden">
        {visibleRows.map((row) => (
          <article key={row.field} className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="whitespace-normal break-normal font-medium text-slate-100 [overflow-wrap:normal]">{row.field}</div>
                <div className="mt-1 text-slate-300">{row.value}</div>
              </div>
              {renderStatus(row)}
            </div>
            <div className="mt-4 break-words text-slate-300">{row.source}</div>
            <div className="mt-1 text-xs text-slate-500">{row.sourcesCount} supporting sources</div>
            {row.reasoning ? <div className="mt-2 text-xs leading-6 text-slate-400">{row.reasoning}</div> : null}
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 min-w-0 flex-1 rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.max(row.confidence, 8)}%` }} />
              </div>
              <span className="text-slate-300">{row.confidence}%</span>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 hidden overflow-hidden rounded-[1.25rem] border border-white/10 md:block">
        <table className="w-full table-fixed divide-y divide-white/10 text-sm">
          <colgroup>
            <col className="w-[19%]" />
            <col className="w-[16%]" />
            <col className="w-[27%]" />
            <col className="w-[20%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead className="bg-white/5 text-left text-slate-400">
            <tr>
              <th className="px-3 py-3">Field</th>
              <th className="px-3 py-3">Value</th>
              <th className="px-3 py-3">Source & Evidence</th>
              <th className="px-3 py-3">Confidence</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-[#081423] text-slate-200">
            {visibleRows.map((row) => (
              <tr key={row.field} className="align-middle">
                <td className="whitespace-normal break-normal px-3 py-3 font-medium text-slate-100 [overflow-wrap:normal]">{row.field}</td>
                <td className="break-words px-3 py-3 align-middle">{row.value}</td>
                <td className="px-3 py-3">
                  <div className="break-words text-slate-300">{row.source}</div>
                  <div className="mt-1 text-xs text-slate-500">{row.sourcesCount} supporting sources</div>
                  {row.reasoning ? <div className="mt-2 text-xs leading-6 text-slate-400">{row.reasoning}</div> : null}
                </td>
                <td className="px-3 py-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="h-2 min-w-12 flex-1 rounded-full bg-white/10">
                      <div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.max(row.confidence, 8)}%` }} />
                    </div>
                    <span>{row.confidence}%</span>
                  </div>
                </td>
                <td className="break-words px-3 py-3">{renderStatus(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
