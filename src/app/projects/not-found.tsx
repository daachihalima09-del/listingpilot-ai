import Link from 'next/link';

export default function ProjectNotFound() {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#081423] p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
        Project unavailable
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-white">
        This project is not available in the active workspace.
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        It may have been removed, or it may belong to another workspace.
      </p>
      <Link
        href="/projects"
        className="mt-6 inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
      >
        Back to Saved Projects
      </Link>
    </div>
  );
}
