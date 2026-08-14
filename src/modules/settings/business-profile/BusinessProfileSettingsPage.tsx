import { CircleAlert } from 'lucide-react';

interface BusinessProfileSettingsPageProps {
  eyebrow: string;
  title: string;
  description: string;
  notice?: string;
  children: React.ReactNode;
}

export function BusinessProfileSettingsPage({
  eyebrow,
  title,
  description,
  notice,
  children,
}: BusinessProfileSettingsPageProps) {
  return (
    <div className="pb-16">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-base leading-7 text-slate-400">{description}</p>
      </div>

      {notice ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm leading-6 text-amber-50">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
          <p>{notice}</p>
        </div>
      ) : null}

      <div className="mt-7 rounded-[2rem] border border-white/10 bg-[#081423]/95 p-4 shadow-[0_28px_80px_rgba(0,0,0,0.28)] sm:p-8">
        {children}
      </div>
    </div>
  );
}
