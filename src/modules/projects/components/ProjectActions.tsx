'use client';

import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, Pencil, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  ProjectApiError,
  projectApiRequest,
} from '../client/project-api';
import { renameProjectSchema } from '../validators/project';

interface ProjectMutationResponse {
  project: {
    version: number;
  };
}

export function ProjectActions({
  project,
  archived,
}: {
  project: {
    id: string;
    workspaceId: string;
    name: string;
    version: number;
  };
  archived: boolean;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(project.version);
  const [name, setName] = useState(project.name);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [pendingAction, setPendingAction] = useState<
    'rename' | 'archive' | 'restore' | 'delete' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingAction) {
      return;
    }

    const parsed = renameProjectSchema.safeParse({
      workspaceId: project.workspaceId,
      projectId: project.id,
      version,
      name,
    });
    if (!parsed.success) {
      setNameError(parsed.error.flatten().fieldErrors.name?.[0] ?? 'Project name is invalid.');
      return;
    }

    setPendingAction('rename');
    setError(null);
    setNameError(null);
    try {
      const response = await projectApiRequest<ProjectMutationResponse>(
        `/api/projects/${project.id}`,
        {
          method: 'PATCH',
          body: {
            workspaceId: project.workspaceId,
            version,
            name: parsed.data.name,
          },
        },
      );
      setVersion(response.project.version);
      setName(parsed.data.name);
      setRenameOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ProjectApiError
        ? requestError.message
        : 'The project could not be renamed.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleLifecycle(action: 'archive' | 'restore') {
    if (pendingAction) {
      return;
    }

    setPendingAction(action);
    setError(null);
    try {
      const response = await projectApiRequest<ProjectMutationResponse>(
        `/api/projects/${project.id}/${action}`,
        {
          method: 'POST',
          body: {
            workspaceId: project.workspaceId,
            version,
          },
        },
      );
      setVersion(response.project.version);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ProjectApiError
        ? requestError.message
        : `The project could not be ${action}d.`);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete() {
    if (pendingAction || confirmation !== project.name) {
      return;
    }

    setPendingAction('delete');
    setError(null);
    try {
      await projectApiRequest<null>(`/api/projects/${project.id}`, {
        method: 'DELETE',
        body: {
          workspaceId: project.workspaceId,
          version,
        },
      });
      setDeleteOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ProjectApiError
        ? requestError.message
        : 'The project could not be deleted.');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {renameOpen ? (
        <form onSubmit={handleRename} className="mb-4 rounded-xl border border-white/10 bg-[#07111f] p-3">
          <label htmlFor={`rename-${project.id}`} className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Project name
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={`rename-${project.id}`}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
              }}
              maxLength={200}
              disabled={Boolean(pendingAction)}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#081423] px-3 py-2 text-sm text-white outline-none focus:border-amber-300/60"
            />
            <button
              type="submit"
              disabled={Boolean(pendingAction)}
              className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
            >
              {pendingAction === 'rename' ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setName(project.name);
                setRenameOpen(false);
              }}
              disabled={Boolean(pendingAction)}
              aria-label="Cancel rename"
              className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {nameError ? <p className="mt-2 text-xs text-rose-300">{nameError}</p> : null}
        </form>
      ) : null}

      {deleteOpen ? (
        <div className="mb-4 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4">
          <p className="text-sm font-semibold text-rose-100">Permanently delete this project?</p>
          <p className="mt-2 text-xs leading-5 text-rose-200/80">
            This cannot be undone. Type <span className="font-semibold">{project.name}</span> to confirm.
          </p>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={Boolean(pendingAction)}
            className="mt-3 w-full rounded-lg border border-rose-300/20 bg-[#07111f] px-3 py-2 text-sm text-white outline-none focus:border-rose-300/60"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={confirmation !== project.name || Boolean(pendingAction)}
              className="rounded-lg bg-rose-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingAction === 'delete' ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmation('');
                setDeleteOpen(false);
              }}
              disabled={Boolean(pendingAction)}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!archived ? (
          <>
            <button
              type="button"
              onClick={() => setRenameOpen((current) => !current)}
              disabled={Boolean(pendingAction)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Rename
            </button>
            <button
              type="button"
              onClick={() => void handleLifecycle('archive')}
              disabled={Boolean(pendingAction)}
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 transition hover:bg-amber-400/15 disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              {pendingAction === 'archive' ? 'Archiving…' : 'Archive'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void handleLifecycle('restore')}
            disabled={Boolean(pendingAction)}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200 transition hover:bg-emerald-400/15 disabled:opacity-50"
          >
            <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
            {pendingAction === 'restore' ? 'Restoring…' : 'Restore'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDeleteOpen((current) => !current)}
          disabled={Boolean(pendingAction)}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-500 transition hover:border-rose-400/20 hover:text-rose-300 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete
        </button>
      </div>
    </div>
  );
}
