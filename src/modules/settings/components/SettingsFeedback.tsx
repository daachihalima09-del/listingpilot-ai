'use client';

import { CircleCheck, CircleX } from 'lucide-react';

export function SettingsFeedback({
  status,
  message,
}: {
  status: 'idle' | 'submitting' | 'success' | 'error';
  message?: string;
}) {
  if (!message || status === 'idle' || status === 'submitting') {
    return null;
  }

  const isSuccess = status === 'success';
  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      aria-live="polite"
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
        isSuccess
          ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
          : 'border-rose-400/25 bg-rose-400/10 text-rose-200'
      }`}
    >
      {isSuccess
        ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        : <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
      {message}
    </div>
  );
}

export function SettingsFieldError({
  id,
  messages,
}: {
  id: string;
  messages?: string[];
}) {
  if (!messages?.length) {
    return null;
  }

  return (
    <p id={id} className="mt-2 text-sm text-rose-300">
      {messages[0]}
    </p>
  );
}

export const settingsInputClassName = 'mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20 disabled:cursor-not-allowed disabled:opacity-60';
