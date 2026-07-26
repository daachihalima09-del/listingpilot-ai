'use client';

import {
  CheckCircle2,
  Circle,
  CircleAlert,
  Clock3,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  CoordinatorClientError,
  createCoordinatorClient,
} from '../coordinator/coordinator-client';
import type {
  CoordinatorExecutionDto,
  CoordinatorStepStatus,
} from '../coordinator/coordinator-types';

function StatusIcon({ status }: { status: CoordinatorStepStatus }) {
  if (status === 'RUNNING') {
    return <LoaderCircle className="h-4 w-4 animate-spin text-amber-300" />;
  }
  if (status === 'SUCCEEDED' || status === 'UNCHANGED') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  }
  if (status === 'PENDING') return <Clock3 className="h-4 w-4 text-sky-300" />;
  if (['FAILED', 'PARTIAL', 'BLOCKED'].includes(status)) {
    return <CircleAlert className="h-4 w-4 text-rose-300" />;
  }
  return <Circle className="h-4 w-4 text-slate-500" />;
}

export function ShopifyPublicationCoordinatorPanel({
  projectId,
  configured,
  connected,
  canManage,
  initialCoordinator,
  onCompleted,
}: {
  projectId: string;
  configured: boolean;
  connected: boolean;
  canManage: boolean;
  initialCoordinator: CoordinatorExecutionDto;
  onCompleted?: (result: CoordinatorExecutionDto) => void;
}) {
  const client = useRef(createCoordinatorClient());
  const locked = useRef(false);
  const [coordinator, setCoordinator] = useState(initialCoordinator);
  const [activity, setActivity] = useState<
    'idle' | 'publish' | 'retry' | 'refresh'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'publish' | 'retry' | 'refresh') {
    if (locked.current) return;
    locked.current = true;
    setActivity(action);
    setError(null);
    try {
      const result = await client.current.run(projectId, action);
      setCoordinator(result);
      onCompleted?.(result);
    } catch (cause) {
      setError(cause instanceof CoordinatorClientError
        ? cause.message
        : 'Shopify publication could not be completed.');
    } finally {
      locked.current = false;
      setActivity('idle');
    }
  }

  const busy = activity !== 'idle' || coordinator.isRunning;
  return (
    <section
      aria-labelledby="shopify-coordinator-heading"
      className="rounded-[1.75rem] border border-amber-400/20 bg-gradient-to-br from-[#0d1b2b] to-[#081423] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="shopify-coordinator-heading" className="flex items-center gap-2 text-base font-semibold text-white">
            <ShoppingBag className="h-5 w-5 text-amber-300" />
            Publish to Shopify
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            Publish the product, variants, metafields, and images in safe dependency order.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
          {busy ? 'Publishing' : coordinator.overallStatus.replaceAll('_', ' ')}
        </span>
      </div>

      {!configured || !connected ? (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Shopify must be configured and connected.{' '}
          <Link href="/settings/shopify" className="font-semibold underline">
            Open Shopify settings
          </Link>
        </div>
      ) : !canManage ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          You can view publication progress. Store-owner permission is required to publish.
        </div>
      ) : null}

      <ol className="mt-5 grid gap-2 sm:grid-cols-2">
        {coordinator.steps.map((step, index) => (
          <li key={step.step} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mt-0.5"><StatusIcon status={step.status} /></div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {index + 1}. {step.displayName}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                {step.progressLabel}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {step.safeMessage}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-sm text-slate-300">{coordinator.safeSummary}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {coordinator.canPublish ? (
          <button type="button" disabled={busy} onClick={() => void run('publish')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-semibold text-slate-950 disabled:opacity-50">
            {activity === 'publish' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
            Publish All
          </button>
        ) : null}
        {coordinator.canRetry ? (
          <button type="button" disabled={busy} onClick={() => void run('retry')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-50">
            <RotateCcw className="h-4 w-4" /> Retry Unresolved
          </button>
        ) : null}
        {coordinator.canRefresh ? (
          <button type="button" disabled={busy} onClick={() => void run('refresh')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Refresh Status
          </button>
        ) : null}
      </div>
      {error ? <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</div> : null}
    </section>
  );
}
