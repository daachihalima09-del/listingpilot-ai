export default function SettingsLoading() {
  return (
    <div
      role="status"
      aria-label="Loading settings"
      className="animate-pulse rounded-[2rem] border border-white/10 bg-[#081423]/95 p-6 sm:p-8"
    >
      <div className="h-3 w-28 rounded-full bg-amber-300/20" />
      <div className="mt-5 h-9 w-72 max-w-full rounded-xl bg-white/10" />
      <div className="mt-4 h-4 w-full max-w-xl rounded-full bg-white/5" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="h-28 rounded-2xl bg-white/5" />
        <div className="h-28 rounded-2xl bg-white/5" />
      </div>
      <div className="mt-8 h-24 rounded-2xl bg-white/5" />
    </div>
  );
}
