import { CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react';
import type { PipelineStage } from '@/types/product';

interface ProductPipelineProps {
  activeStage: PipelineStage;
  completedStages: PipelineStage[];
  isRunning: boolean;
  hasConflict: boolean;
}

const stages = [
  { key: 'input' as const, label: 'Input' },
  { key: 'extract' as const, label: 'Extract Facts' },
  { key: 'verify' as const, label: 'Verify & Validate' },
  { key: 'generate' as const, label: 'Generate Listing' },
  { key: 'review' as const, label: 'AI Review' },
  { key: 'export' as const, label: 'Export Ready' },
];

export function ProductPipeline({ activeStage, completedStages, isRunning, hasConflict }: ProductPipelineProps) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <Sparkles className="h-4 w-4 text-amber-300" />
        <span>AI Product Pipeline</span>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Live
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {stages.map((stage, index) => {
          const isCompleted = completedStages.includes(stage.key);
          const isActive = activeStage === stage.key;
          const isPending = !isCompleted && !isActive;
          const isLast = index === stages.length - 1;

          return (
            <div key={stage.key} className="flex flex-1 items-center gap-3 min-w-[140px]">
              <div className={`flex flex-1 items-center gap-3 rounded-2xl border px-3 py-3 ${isCompleted ? 'border-amber-400/20 bg-amber-400/10' : isActive ? 'border-amber-400/30 bg-amber-400/20 shadow-[0_0_0_1px_rgba(255,199,76,0.2)]' : 'border-white/10 bg-white/5'}`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isCompleted ? 'bg-amber-400/20 text-amber-300' : isActive ? 'bg-amber-400/30 text-amber-200' : 'bg-slate-700/70 text-slate-500'}`}>
                  {isActive && isRunning ? <Loader2 className={`h-4 w-4 ${isActive ? 'animate-spin' : ''}`} /> : isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${isCompleted ? 'text-amber-200' : isActive ? 'text-slate-100' : isPending ? 'text-slate-500' : 'text-slate-200'}`}>{stage.label}</div>
                  {hasConflict && stage.key === 'verify' ? <div className="text-xs text-rose-400">Conflict detected</div> : null}
                </div>
              </div>
              {!isLast ? <div className={`hidden h-px flex-1 lg:block ${isCompleted ? 'bg-amber-400/30' : 'bg-white/10'}`} /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
