'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ProjectApiError, projectApiRequest } from '../client/project-api';
import { createProjectSchema } from '../validators/project';

interface CreateProjectResponse { project: { id: string } }

const inputClass = 'mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-base text-white outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20 disabled:opacity-60';

export function CreateProjectForm({ organizationId, workspaceId }: { organizationId: string; workspaceId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sharedDefaults, setSharedDefaults] = useState<boolean | null>(null);
  const [defaultProductType, setDefaultProductType] = useState('');
  const [defaultCollection, setDefaultCollection] = useState('');
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (sharedDefaults === null) {
      setFormError('Choose Yes or No for shared Product defaults.');
      return;
    }
    const parsed = createProjectSchema.safeParse({
      workspaceId,
      name,
      defaultProductType: sharedDefaults ? defaultProductType : null,
      defaultCollection: sharedDefaults ? defaultCollection : null,
    });
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      setFormError('Please correct the highlighted fields.');
      return;
    }
    setPending(true); setFormError(null); setFieldErrors({});
    try {
      const response = await projectApiRequest<CreateProjectResponse>('/api/projects', { method: 'POST', body: parsed.data });
      router.push(`/workspace/${response.project.id}?${new URLSearchParams({ organizationId, workspaceId })}`);
    } catch (error) {
      if (error instanceof ProjectApiError) { setFormError(error.message); setFieldErrors(error.fieldErrors ?? {}); }
      else setFormError('The Project could not be created.');
    } finally { setPending(false); }
  }

  return <form onSubmit={handleSubmit} className="space-y-6" noValidate>
    {formError ? <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{formError}</div> : null}
    <label className="block text-sm font-medium text-slate-200">Project name
      <input id="project-name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={200} disabled={pending} autoFocus className={inputClass} placeholder="Samsung TVs" aria-invalid={Boolean(fieldErrors.name)} />
      {fieldErrors.name?.[0] ? <span className="mt-2 block text-sm text-rose-300">{fieldErrors.name[0]}</span> : null}
    </label>
    <fieldset>
      <legend className="text-sm font-medium text-slate-200">Are most Products in this Project part of the same Product Type or Collection?</legend>
      <div className="mt-3 flex gap-3">
        {[{ label: 'Yes', value: true }, { label: 'No', value: false }].map((option) => <label key={option.label} className={`flex min-w-24 cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 ${sharedDefaults === option.value ? 'border-amber-300/50 bg-amber-300/10 text-amber-100' : 'border-white/10 text-slate-300'}`}><input type="radio" name="shared-defaults" checked={sharedDefaults === option.value} onChange={() => setSharedDefaults(option.value)} disabled={pending} />{option.label}</label>)}
      </div>
    </fieldset>
    {sharedDefaults ? <div className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-200">Default Product Type<input value={defaultProductType} onChange={(event) => setDefaultProductType(event.target.value)} maxLength={255} disabled={pending} className={inputClass} placeholder="Televisions" /></label>
      <label className="text-sm font-medium text-slate-200">Default Collection<input value={defaultCollection} onChange={(event) => setDefaultCollection(event.target.value)} maxLength={255} disabled={pending} className={inputClass} placeholder="TVs" /></label>
      <p className="text-xs text-slate-400 sm:col-span-2">These are starting defaults. Each Product can override them.</p>
    </div> : null}
    <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60">{pending ? 'Creating…' : 'Create Project'}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
  </form>;
}
