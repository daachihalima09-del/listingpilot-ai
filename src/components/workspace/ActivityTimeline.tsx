import { CheckCircle2, Loader2, Circle } from 'lucide-react';

interface ActivityTimelineProps {
  currentIndex: number;
  completedCount: number;
  hasConflict: boolean;
}

const events = [
  'Reading Supplier URL',
  'Extracting Facts',
  'Checking Samsung Official',
  'Checking Amazon',
  'Finding Conflict in Refresh Rate',
  'Building Product Truth',
  'Generating Listing',
  'Running Quality Review',
  'Shopify Ready',
];

export function ActivityTimeline({ currentIndex, completedCount, hasConflict }: ActivityTimelineProps) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5">
      <div className="text-sm font-semibold text-slate-100">Live activity timeline</div>
      <div className="mt-4 space-y-3">
        {events.map((event, index) => {
          const isComplete = index < completedCount;
          const isCurrent = index === currentIndex;
          return (
            <div key={event} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${isComplete ? 'border-emerald-400/20 bg-emerald-400/10' : isCurrent ? 'border-amber-400/20 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-full ${isComplete ? 'bg-emerald-400/20 text-emerald-300' : isCurrent ? 'bg-amber-400/20 text-amber-300' : 'bg-white/10 text-slate-500'}`}>
                {isCurrent ? <Loader2 className="h-4 w-4 animate-spin" /> : isComplete ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              </div>
              <div className="flex-1 text-sm text-slate-200">{event}</div>
              {hasConflict && event === 'Finding Conflict in Refresh Rate' ? <span className="text-xs font-semibold text-rose-400">Conflict</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
