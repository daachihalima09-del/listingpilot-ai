'use client';

export default function ProjectsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-[2rem] border border-rose-400/20 bg-[#081423] p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">
        Projects unavailable
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-white">
        Saved Projects could not be loaded.
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        No changes were made. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
      >
        Try again
      </button>
    </div>
  );
}
