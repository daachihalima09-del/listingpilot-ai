'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  ProjectApiError,
  projectApiRequest,
} from '../client/project-api';
import {
  createProjectSchema,
  type ProjectSourceType,
} from '../validators/project';

interface CreateProjectResponse {
  project: {
    id: string;
  };
}

export function CreateProjectForm({
  organizationId,
  workspaceId,
}: {
  organizationId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<ProjectSourceType | ''>('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [rawInput, setRawInput] = useState('');
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const parsed = createProjectSchema.safeParse({
      workspaceId,
      name,
      sourceType: sourceType || null,
      sourceUrl: sourceUrl.trim() || null,
      rawInput: rawInput || null,
    });
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      setFormError('Please correct the highlighted fields.');
      return;
    }

    setPending(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const response = await projectApiRequest<CreateProjectResponse>(
        '/api/projects',
        {
          method: 'POST',
          body: parsed.data,
        },
      );
      router.push(`/workspace/${response.project.id}?${new URLSearchParams({
        organizationId,
        workspaceId,
      })}`);
    } catch (error) {
      if (error instanceof ProjectApiError) {
        setFormError(error.message);
        setFieldErrors(error.fieldErrors ?? {});
      } else {
        setFormError('The project could not be created.');
      }
    } finally {
      setPending(false);
    }
  }

  const expectsUrl = sourceType === 'SUPPLIER_URL' || sourceType === 'PRODUCT_URL';

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {formError ? (
        <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {formError}
        </div>
      ) : null}

      <div>
        <label htmlFor="project-name" className="text-sm font-medium text-slate-200">
          Project name
        </label>
        <input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          maxLength={200}
          disabled={pending}
          autoFocus
          className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-base text-white outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20 disabled:opacity-60"
          placeholder="Summer catalog refresh"
          aria-invalid={Boolean(fieldErrors.name)}
        />
        {fieldErrors.name?.[0] ? <p className="mt-2 text-sm text-rose-300">{fieldErrors.name[0]}</p> : null}
      </div>

      <div>
        <label htmlFor="project-source-type" className="text-sm font-medium text-slate-200">
          Starting source <span className="text-slate-500">(optional)</span>
        </label>
        <select
          id="project-source-type"
          value={sourceType}
          onChange={(event) => {
            setSourceType(event.target.value as ProjectSourceType | '');
            setSourceUrl('');
            setRawInput('');
          }}
          disabled={pending}
          className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-base text-white outline-none focus:border-amber-300/60"
        >
          <option value="">Start with a blank project</option>
          <option value="RAW_SPECIFICATIONS">Raw specifications</option>
          <option value="SUPPLIER_URL">Supplier URL</option>
          <option value="PRODUCT_URL">Product URL</option>
        </select>
      </div>

      {expectsUrl ? (
        <div>
          <label htmlFor="project-source-url" className="text-sm font-medium text-slate-200">
            Source URL <span className="text-slate-500">(optional)</span>
          </label>
          <input
            id="project-source-url"
            type="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            disabled={pending}
            maxLength={2_048}
            className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-base text-white outline-none focus:border-amber-300/60"
            placeholder="https://supplier.example.com/product"
            aria-invalid={Boolean(fieldErrors.sourceUrl)}
          />
          {fieldErrors.sourceUrl?.[0] ? <p className="mt-2 text-sm text-rose-300">{fieldErrors.sourceUrl[0]}</p> : null}
        </div>
      ) : null}

      {sourceType === 'RAW_SPECIFICATIONS' ? (
        <div>
          <label htmlFor="project-raw-input" className="text-sm font-medium text-slate-200">
            Raw specifications <span className="text-slate-500">(optional)</span>
          </label>
          <textarea
            id="project-raw-input"
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            disabled={pending}
            maxLength={100_000}
            className="mt-2 min-h-36 w-full resize-y rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-base text-white outline-none focus:border-amber-300/60"
            placeholder="Paste material, dimensions, features, certifications, and claims…"
          />
          {fieldErrors.rawInput?.[0] ? <p className="mt-2 text-sm text-rose-300">{fieldErrors.rawInput[0]}</p> : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create project'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}
