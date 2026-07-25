'use client';

import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  LoaderCircle,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import type { ShopifyConnectionStatusDto } from '../services/connection-status';
import type { ShopifySettingsViewState } from '../settings/settings-view';
import { shopDomainSchema } from '../validators/shop-domain';
import { settingsInputClassName } from '@/modules/settings/components/SettingsFeedback';

interface Notice {
  tone: 'success' | 'error';
  message: string;
}

function formatDate(value: string | null): string {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function safeAuthorizationUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:'
      && url.hostname.endsWith('.myshopify.com')
      && url.pathname === '/admin/oauth/authorize'
    ) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function ShopifySettingsPanel({
  configured,
  connection,
  viewState,
  initialNotice,
}: {
  configured: boolean;
  connection: ShopifyConnectionStatusDto;
  viewState: ShopifySettingsViewState;
  initialNotice: Notice | null;
}) {
  const [shop, setShop] = useState(connection.shopDomain ?? '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [feedback, setFeedback] = useState<Notice | null>(initialNotice);

  async function startConnection(domain: string) {
    if (!configured || !connection.canManage || isConnecting) return;
    const normalized = shopDomainSchema.safeParse(domain);
    if (!normalized.success) {
      setFeedback({
        tone: 'error',
        message: 'Enter a valid Shopify store name or myshopify.com domain.',
      });
      return;
    }

    setIsConnecting(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shop: normalized.data }),
      });
      const payload = await response.json() as {
        authorizationUrl?: unknown;
      };
      const authorizationUrl = response.ok
        ? safeAuthorizationUrl(payload.authorizationUrl)
        : null;
      if (!authorizationUrl) {
        setFeedback({
          tone: 'error',
          message: 'The Shopify connection could not be started.',
        });
        return;
      }
      window.location.assign(authorizationUrl);
    } catch {
      setFeedback({
        tone: 'error',
        message: 'The Shopify connection could not be started.',
      });
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await startConnection(shop);
  }

  async function handleDisconnect() {
    if (!connection.canManage || isDisconnecting) return;
    const confirmed = window.confirm(
      'Disconnect this Shopify store? ListingPilot will remove its stored access. You may also need to uninstall the app from Shopify Admin.',
    );
    if (!confirmed) return;

    setIsDisconnecting(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/shopify/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: 'The Shopify store could not be disconnected.',
        });
        return;
      }
      window.location.assign('/settings/shopify?status=disconnected');
    } catch {
      setFeedback({
        tone: 'error',
        message: 'The Shopify store could not be disconnected.',
      });
    } finally {
      setIsDisconnecting(false);
    }
  }

  const showConnectionForm = (
    viewState === 'NOT_CONNECTED'
    || viewState === 'DISCONNECTED'
    || viewState === 'REAUTHORIZATION_REQUIRED'
  );

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role={feedback.tone === 'success' ? 'status' : 'alert'}
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.tone === 'success'
              ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
              : 'border-rose-400/25 bg-rose-400/10 text-rose-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {viewState === 'CONFIGURATION_MISSING' && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-white">Shopify configuration required</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Configure the Shopify app credentials in the server environment before connecting a store.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled
            className="mt-5 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 opacity-50"
          >
            Connect Shopify Store
          </button>
        </div>
      )}

      {showConnectionForm && (
        <form onSubmit={handleConnect} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {viewState === 'DISCONNECTED' && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-500/25 bg-slate-400/10 px-3 py-1.5 text-xs font-semibold text-slate-300">
              <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
              Disconnected
            </div>
          )}
          <h2 className="font-semibold text-white">
            {viewState === 'NOT_CONNECTED' ? 'Connect Shopify' : 'Reconnect Shopify'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Connect a Shopify shop to prepare ListingPilot for secure publishing workflows.
          </p>
          <label htmlFor="shop-domain" className="mt-5 block text-sm font-medium text-slate-200">
            Shopify store domain
          </label>
          <input
            id="shop-domain"
            value={shop}
            onChange={(event) => {
              setShop(event.target.value);
              setFeedback(null);
            }}
            placeholder="sample-store.myshopify.com"
            disabled={!configured || !connection.canManage || isConnecting}
            className={settingsInputClassName}
          />
          {connection.canManage ? (
            <button
              type="submit"
              disabled={!configured || isConnecting}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isConnecting
                ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <Link2 className="h-4 w-4" aria-hidden="true" />}
              {isConnecting
                ? 'Connecting…'
                : viewState === 'NOT_CONNECTED'
                  ? 'Connect Shopify Store'
                  : 'Reconnect Shopify Store'}
            </button>
          ) : (
            <p className="mt-5 text-sm text-slate-400">
              Only the workspace owner can connect or reconnect Shopify.
            </p>
          )}
        </form>
      )}

      {viewState === 'CONNECTED' && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
          <div className="flex items-center gap-2 text-emerald-200">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            <h2 className="font-semibold">Connected</h2>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wider text-slate-500">Shop</dt><dd className="mt-1 text-sm text-white">{connection.shopName ?? 'Shopify store'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-slate-500">Domain</dt><dd className="mt-1 break-all text-sm text-white">{connection.shopDomain}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-slate-500">Connected</dt><dd className="mt-1 text-sm text-white">{formatDate(connection.installedAt)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-slate-500">Last verified</dt><dd className="mt-1 text-sm text-white">{formatDate(connection.lastVerifiedAt)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wider text-slate-500">Granted access</dt><dd className="mt-1 text-sm text-white">{connection.grantedScopes.length ? connection.grantedScopes.join(', ') : 'No scopes reported'}</dd></div>
          </dl>
          {connection.canManage && (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void startConnection(connection.shopDomain ?? '')}
                disabled={isConnecting}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {isConnecting ? 'Connecting…' : 'Reconnect Shopify Store'}
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={isDisconnecting}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-400/25 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-400/10 disabled:opacity-60"
              >
                <Unplug className="h-4 w-4" aria-hidden="true" />
                {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          )}
          <p className="mt-5 text-xs leading-5 text-slate-500">
            Disconnecting removes ListingPilot&apos;s stored access to this shop. You may also need to uninstall the app from Shopify Admin.
          </p>
        </div>
      )}
    </div>
  );
}
