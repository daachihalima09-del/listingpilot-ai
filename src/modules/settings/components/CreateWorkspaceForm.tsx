'use client';

import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  SettingsFeedback,
  SettingsFieldError,
  settingsInputClassName,
} from './SettingsFeedback';
import { useSettingsMutation } from '../client/use-settings-mutation';
import { workspaceCreateSchema } from '../validators/settings';

interface CreateWorkspaceResponse {
  workspace: {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
  };
  redirectTo: string;
}

export function CreateWorkspaceForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const {
    state,
    isSubmitting,
    mutate,
    clearFeedback,
    setValidationErrors,
  } = useSettingsMutation<CreateWorkspaceResponse>('/api/settings/workspace', 'POST');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const parsed = workspaceCreateSchema.safeParse({ organizationId, name, slug });
    if (!parsed.success) {
      setValidationErrors(parsed.error.flatten().fieldErrors);
      return;
    }

    const result = await mutate(parsed.data);
    if (result) {
      router.push(result.redirectTo);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 border-t border-white/10 pt-8" noValidate>
      <h2 className="text-xl font-semibold text-white">Create another workspace</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
        Start a clean workspace in this organization. Existing workspace data is not copied or changed.
      </p>
      <div className="mt-5 space-y-5 sm:max-w-xl">
        <SettingsFeedback status={state.status} message={state.message} />
        <div>
          <label htmlFor="new-workspace-name" className="text-sm font-medium text-slate-200">Workspace name</label>
          <input id="new-workspace-name" value={name} onChange={(event) => { setName(event.target.value); clearFeedback(); }} disabled={isSubmitting} required minLength={2} maxLength={200} aria-invalid={Boolean(state.fieldErrors?.name)} aria-describedby={state.fieldErrors?.name ? 'new-workspace-name-error' : undefined} className={settingsInputClassName} />
          <SettingsFieldError id="new-workspace-name-error" messages={state.fieldErrors?.name} />
        </div>
        <div>
          <label htmlFor="new-workspace-slug" className="text-sm font-medium text-slate-200">Workspace slug</label>
          <input id="new-workspace-slug" value={slug} onChange={(event) => { setSlug(event.target.value); clearFeedback(); }} disabled={isSubmitting} required minLength={2} maxLength={100} placeholder="neovix-production" aria-invalid={Boolean(state.fieldErrors?.slug)} aria-describedby={state.fieldErrors?.slug ? 'new-workspace-slug-error' : undefined} className={settingsInputClassName} />
          <SettingsFieldError id="new-workspace-slug-error" messages={state.fieldErrors?.slug} />
        </div>
        <button type="submit" disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#081423] disabled:cursor-not-allowed disabled:opacity-60">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {isSubmitting ? 'Creating…' : 'Create workspace'}
        </button>
      </div>
    </form>
  );
}
