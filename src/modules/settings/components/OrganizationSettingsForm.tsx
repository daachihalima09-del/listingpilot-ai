'use client';

import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import {
  SettingsFeedback,
  SettingsFieldError,
  settingsInputClassName,
} from './SettingsFeedback';
import { useSettingsMutation } from '../client/use-settings-mutation';
import { organizationUpdateSchema } from '../validators/settings';

interface OrganizationResponse {
  organization: {
    name: string;
    slug: string;
  };
}

export function OrganizationSettingsForm({
  organization,
  canManage,
}: {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  canManage: boolean;
}) {
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const {
    state,
    isSubmitting,
    mutate,
    clearFeedback,
    setValidationErrors,
  } = useSettingsMutation<OrganizationResponse>('/api/settings/organization');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || isSubmitting) {
      return;
    }

    const parsed = organizationUpdateSchema.safeParse({
      organizationId: organization.id,
      name,
      slug,
    });
    if (!parsed.success) {
      setValidationErrors(parsed.error.flatten().fieldErrors);
      return;
    }

    const result = await mutate(parsed.data);
    if (result) {
      setName(result.organization.name);
      setSlug(result.organization.slug);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
      <SettingsFeedback status={state.status} message={state.message} />

      <div>
        <label htmlFor="organization-name" className="text-sm font-medium text-slate-200">
          Organization name
        </label>
        <input
          id="organization-name"
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
          autoComplete="organization"
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={state.fieldErrors?.name ? 'organization-name-error' : undefined}
          className={settingsInputClassName}
        />
        <SettingsFieldError id="organization-name-error" messages={state.fieldErrors?.name} />
      </div>

      <div>
        <label htmlFor="organization-slug" className="text-sm font-medium text-slate-200">
          Organization slug
        </label>
        <input
          id="organization-slug"
          name="slug"
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            clearFeedback();
          }}
          disabled={!canManage || isSubmitting}
          required
          minLength={2}
          maxLength={100}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={Boolean(state.fieldErrors?.slug)}
          aria-describedby={state.fieldErrors?.slug ? 'organization-slug-error' : 'organization-slug-help'}
          className={settingsInputClassName}
        />
        <p id="organization-slug-help" className="mt-2 text-xs leading-5 text-slate-500">
          Lowercase letters, numbers, and hyphens. Slugs must be unique.
        </p>
        <SettingsFieldError id="organization-slug-error" messages={state.fieldErrors?.slug} />
      </div>

      {canManage ? (
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#081423] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {isSubmitting ? 'Saving…' : 'Save organization'}
        </button>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
          Only an organization owner can edit these settings.
        </p>
      )}
    </form>
  );
}
