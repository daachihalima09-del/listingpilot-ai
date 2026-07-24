'use client';

import { useFormStatus } from 'react-dom';

export function FieldError({
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

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#081423] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Please wait…' : children}
    </button>
  );
}

export const authInputClassName = 'mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20 disabled:opacity-60';
