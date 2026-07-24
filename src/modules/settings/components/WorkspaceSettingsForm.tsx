'use client';

import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import {
  SettingsFeedback,
  SettingsFieldError,
  settingsInputClassName,
} from './SettingsFeedback';
import { useSettingsMutation } from '../client/use-settings-mutation';
import { workspaceUpdateSchema } from '../validators/settings';

interface WorkspaceResponse {
  workspace: {
    name: string;
  };
}

export function WorkspaceSettingsForm({
  workspace,
  canManage,
}: {
  workspace: {
    id: string;
    name: string;
  };
  canManage: boolean;
}) {
  const [name, setName] = useState(workspace.name);
  const {
    state,
    isSubmitting,
    mutate,
    clearFeedback,
    setValidationErrors,
  } = useSettingsMutation<WorkspaceResponse>('/api/settings/workspace');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || isSubmitting) {
      return;
    }

    const parsed = workspaceUpdateSchema.safeParse({
      workspaceId: workspace.id,
      name,
    });
    if (!parsed.success) {
      setValidationErrors(parsed.error.flatten().fieldErrors);
      return;
    }

    const result = await mutate(parsed.data);
    if (result) {
      setName(result.workspace.name);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
      <SettingsFeedback status={state.status} message={state.message} />

      <div>
        <label htmlFor="workspace-name" className="text-sm font-medium text-slate-200">
          Workspace name
        </label>
        <input
          id="workspace-name"
          name="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            clearFeedback();
          }}
          disabled={!canManage || isSubmitting}
          required
          minLength={2}
          maxLength={200}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={state.fieldErrors?.name ? 'workspace-name-error' : undefined}
          className={settingsInputClassName}
        />
        <SettingsFieldError id="workspace-name-error" messages={state.fieldErrors?.name} />
      </div>

      {canManage ? (
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#081423] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {isSubmitting ? 'Saving…' : 'Save workspace'}
        </button>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
          Only an organization owner can edit these settings.
        </p>
      )}
    </form>
  );
}
