export default function ProjectsLoading() {
  return (
    <div role="status" aria-label="Loading projects" className="animate-pulse">
      <div className="h-3 w-32 rounded-full bg-amber-300/20" />
      <div className="mt-5 h-10 w-72 max-w-full rounded-xl bg-white/10" />
      <div className="mt-4 h-4 w-full max-w-xl rounded-full bg-white/5" />
      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <div className="h-72 rounded-[1.5rem] bg-white/5" />
        <div className="h-72 rounded-[1.5rem] bg-white/5" />
      </div>
    </div>
  );
}
