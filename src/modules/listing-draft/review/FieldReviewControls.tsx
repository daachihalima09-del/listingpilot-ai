'use client';

import { Lock, LockOpen, Search } from 'lucide-react';
import type { FieldReviewStatus } from './review-model.ts';

const badgeStyles: Record<FieldReviewStatus, string> = {
  Verified: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  'Needs Review': 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  'Merchant Edited': 'border-sky-400/20 bg-sky-400/10 text-sky-200',
};

export function FieldReviewControls({
  fieldKey,
  status,
  locked,
  readOnly,
  onTrace,
  onToggleLock,
}: {
  readonly fieldKey: string;
  readonly status: FieldReviewStatus;
  readonly locked: boolean;
  readonly readOnly: boolean;
  readonly onTrace: (fieldKey: string) => void;
  readonly onToggleLock: (fieldKey: string) => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeStyles[status]}`}>{status}</span>
      <button type="button" onClick={() => onTrace(fieldKey)} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-white/10" aria-label={`Why was ${fieldKey} generated?`}>
        <Search className="h-3 w-3" aria-hidden="true" /> Why?
      </button>
      {!readOnly ? (
        <button type="button" onClick={() => onToggleLock(fieldKey)} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-white/10" aria-pressed={locked} aria-label={`${locked ? 'Unlock' : 'Lock'} ${fieldKey}`}>
          {locked ? <Lock className="h-3 w-3" aria-hidden="true" /> : <LockOpen className="h-3 w-3" aria-hidden="true" />}
          {locked ? 'Locked' : 'Lock'}
        </button>
      ) : null}
    </span>
  );
}
