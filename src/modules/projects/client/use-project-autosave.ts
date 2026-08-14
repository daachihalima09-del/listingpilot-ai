'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ProjectApiError,
  projectApiRequest,
} from './project-api';
import type {
  ProjectAnalysisData,
  ProjectGeneratedListing,
  ProjectReadinessData,
  ProjectSeoData,
  ProjectSourceType,
  ProjectStatus,
} from '../validators/project';

export interface ProjectSaveSnapshot {
  sourceType: ProjectSourceType | null;
  sourceUrl: string | null;
  rawInput: string | null;
  analysisData: ProjectAnalysisData | null;
  generatedListing: ProjectGeneratedListing | null;
  seoData: ProjectSeoData | null;
  readinessData: ProjectReadinessData | null;
}

export interface SavedProjectWorkspace {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  status: ProjectStatus;
  version: number;
  updatedAt: string;
  sourceType: ProjectSourceType | null;
  sourceUrl: string | null;
  rawInput: string | null;
  analysisData: ProjectAnalysisData | null;
  generatedListing: ProjectGeneratedListing | null;
  seoData: ProjectSeoData | null;
  readinessData: ProjectReadinessData | null;
}

interface SaveQueueItem {
  hash: string;
  snapshot: ProjectSaveSnapshot;
}

interface ProjectStateResponse {
  project: {
    version: number;
    updatedAt: string;
  };
}

type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict' | 'readonly';

export function useProjectAutosave({
  project,
  snapshot,
  enabled,
}: {
  project: SavedProjectWorkspace | null;
  snapshot: ProjectSaveSnapshot;
  enabled: boolean;
}) {
  const initialHash = useRef(JSON.stringify(snapshot));
  const lastSavedHash = useRef(initialHash.current);
  const version = useRef(project?.version ?? 0);
  const queuedSave = useRef<SaveQueueItem | null>(null);
  const flushWaiters = useRef<Array<{
    hash: string;
    resolve: (version: number | null) => void;
  }>>([]);
  const processing = useRef(false);
  const blockedByConflict = useRef(false);
  const mounted = useRef(true);
  const [status, setStatus] = useState<SaveStatus>(
    project && !enabled ? 'readonly' : 'saved',
  );
  const [message, setMessage] = useState(
    project && !enabled ? 'Read only' : project ? 'Saved' : 'Not saved',
  );
  const [currentVersion, setCurrentVersion] = useState(project?.version ?? 0);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const processQueue = useCallback(async () => {
    if (!project || !enabled || processing.current || blockedByConflict.current) {
      return;
    }

    processing.current = true;
    while (queuedSave.current && !blockedByConflict.current) {
      const item = queuedSave.current;
      queuedSave.current = null;
      if (item.hash === lastSavedHash.current) {
        continue;
      }

      if (mounted.current) {
        setStatus('saving');
        setMessage('Saving…');
      }

      try {
        const response = await projectApiRequest<ProjectStateResponse>(
          `/api/projects/${project.id}/state`,
          {
            method: 'PATCH',
            body: {
              workspaceId: project.workspaceId,
              version: version.current,
              ...item.snapshot,
            },
          },
        );
        version.current = response.project.version;
        setCurrentVersion(response.project.version);
        lastSavedHash.current = item.hash;
        if (mounted.current) {
          setStatus('saved');
          setMessage('Saved');
        }
      } catch (error) {
        if (error instanceof ProjectApiError && error.status === 409) {
          blockedByConflict.current = true;
          queuedSave.current = null;
          if (mounted.current) {
            setStatus('conflict');
            setMessage('Newer changes exist. Refresh before saving.');
          }
        } else if (mounted.current) {
          setStatus('error');
          setMessage(error instanceof ProjectApiError
            ? error.message
            : 'Save failed. Try again.');
        }
        break;
      }
    }
    processing.current = false;
    const waiters = flushWaiters.current;
    flushWaiters.current = [];
    for (const waiter of waiters) {
      waiter.resolve(
        !blockedByConflict.current && waiter.hash === lastSavedHash.current
          ? version.current
          : null,
      );
    }
  }, [enabled, project]);

  const enqueueSave = useCallback((nextSnapshot: ProjectSaveSnapshot) => {
    if (!project || !enabled || blockedByConflict.current) {
      return;
    }
    const item = {
      hash: JSON.stringify(nextSnapshot),
      snapshot: nextSnapshot,
    };
    if (item.hash === lastSavedHash.current) {
      if (mounted.current) {
        setStatus('saved');
        setMessage('Saved');
      }
      return;
    }

    queuedSave.current = item;
    if (mounted.current && !processing.current) {
      setStatus('pending');
      setMessage('Unsaved changes');
    }
    void processQueue();
  }, [enabled, processQueue, project]);

  useEffect(() => {
    if (!project || !enabled || blockedByConflict.current) {
      return;
    }

    const hash = JSON.stringify(snapshot);
    if (hash === lastSavedHash.current) {
      return;
    }

    setStatus('pending');
    setMessage('Unsaved changes');
    const timer = window.setTimeout(() => {
      enqueueSave(snapshot);
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [enabled, enqueueSave, project, snapshot]);

  const saveNow = useCallback((): Promise<number | null> => {
    const hash = JSON.stringify(snapshot);
    if (!project || !enabled || blockedByConflict.current) {
      return Promise.resolve(null);
    }
    if (hash === lastSavedHash.current) {
      return Promise.resolve(version.current);
    }
    return new Promise((resolve) => {
      flushWaiters.current.push({ hash, resolve });
      enqueueSave(snapshot);
    });
  }, [enabled, enqueueSave, project, snapshot]);

  const adoptExternalSave = useCallback((nextVersion: number, savedSnapshot: ProjectSaveSnapshot) => {
    const savedHash = JSON.stringify(savedSnapshot);
    version.current = nextVersion;
    setCurrentVersion(nextVersion);
    lastSavedHash.current = savedHash;
    queuedSave.current = null;
    const waiters = flushWaiters.current;
    flushWaiters.current = [];
    for (const waiter of waiters) waiter.resolve(nextVersion);
    blockedByConflict.current = false;
    setStatus('saved');
    setMessage('Saved');
  }, []);

  return {
    status,
    message,
    saveNow,
    currentVersion,
    adoptExternalSave,
  };
}
