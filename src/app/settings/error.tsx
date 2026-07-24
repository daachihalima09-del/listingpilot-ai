'use client';

export default function SettingsErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-[2rem] border border-rose-400/20 bg-[#081423]/95 p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">
        Settings unavailable
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-white">
        We could not load these settings.
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        Check your connection and try again. No changes were made.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
      >
        Try again
      </button>
    </div>
  );
}
