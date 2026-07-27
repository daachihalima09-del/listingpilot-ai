import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth/server/context';
import { ShopifyLaunchError } from '@/modules/shopify/launch/launch-errors';
import { resolveShopifyLaunchIntent } from '@/modules/shopify/launch/launch-intent-service';
import { getShopifyLaunchWorkspaceOptions } from '@/modules/shopify/launch/workspace-selection';
import { prismaShopifyLaunchIntentStore } from '@/modules/shopify/repositories/prisma-launch-intent-repository';
import { prismaShopifyLaunchWorkspaceStore } from '@/modules/shopify/repositories/prisma-launch-workspace-store';

export const metadata: Metadata = {
  title: 'Connect Shopify | ListingPilot AI',
};

interface LaunchPageProps {
  searchParams: Promise<{
    intent?: string | string[];
    error?: string | string[];
  }>;
}

const safeMessages: Record<string, { title: string; message: string }> = {
  invalid_request: {
    title: 'Invalid Shopify request',
    message: 'This Shopify launch could not be verified. Open ListingPilot again from Shopify Admin.',
  },
  expired: {
    title: 'Launch request expired',
    message: 'For your security, Shopify launch links expire quickly. Open the app again from Shopify Admin.',
  },
  consumed: {
    title: 'Launch already completed',
    message: 'This secure launch link has already been used. Check Shopify Settings or start again.',
  },
  not_found: {
    title: 'Launch request unavailable',
    message: 'This launch link is missing or no longer valid. Open the app again from Shopify Admin.',
  },
  owner_required: {
    title: 'Workspace owner required',
    message: 'Only a ListingPilot workspace owner can connect a Shopify store.',
  },
  workspace_unavailable: {
    title: 'Workspace unavailable',
    message: 'That workspace cannot be used for this connection.',
  },
  shop_mismatch: {
    title: 'Workspace connected to another store',
    message: 'Choose a different owner workspace or manage the existing store in Shopify Settings.',
  },
  connection_invalid: {
    title: 'Connection needs attention',
    message: 'The saved connection cannot be used safely. Restart authorization from Shopify Settings.',
  },
};

function StateCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-[2rem] border border-white/10 bg-[#081423]/95 p-8 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Shopify connection</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">{title}</h1>
        <p className="mt-4 leading-7 text-slate-300">{message}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950" href="/settings/shopify">
            Open Shopify Settings
          </Link>
          <Link className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white" href="/">
            Return to ListingPilot
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function ShopifyLaunchPage({
  searchParams,
}: LaunchPageProps) {
  const parameters = await searchParams;
  const nonce = typeof parameters.intent === 'string' ? parameters.intent : '';
  const requestedError = typeof parameters.error === 'string'
    ? parameters.error
    : '';
  if (requestedError && safeMessages[requestedError]) {
    return <StateCard {...safeMessages[requestedError]} />;
  }

  let intent;
  try {
    intent = await resolveShopifyLaunchIntent(
      prismaShopifyLaunchIntentStore,
      nonce,
    );
  } catch (error) {
    const reason = error instanceof ShopifyLaunchError
      ? error.reason
      : 'invalid_request';
    return <StateCard {...(safeMessages[reason] ?? safeMessages.invalid_request)} />;
  }

  const user = await getCurrentUser();
  if (!user || user.status !== 'ACTIVE') {
    const callbackUrl = `/shopify/launch?${new URLSearchParams({
      intent: nonce,
    })}`;
    redirect(`/sign-in?${new URLSearchParams({ callbackUrl })}`);
  }

  const options = await getShopifyLaunchWorkspaceOptions(
    prismaShopifyLaunchWorkspaceStore,
    user.id,
  );
  if (options.ownerWorkspaces.length === 0) {
    return <StateCard {...safeMessages.owner_required} />;
  }
  if (intent.status === 'OAUTH_STARTED') {
    return (
      <StateCard
        title="Shopify authorization in progress"
        message="This launch has already started secure Shopify authorization. Complete the open Shopify request, or restart from Shopify Settings if it expired."
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-[2rem] border border-white/10 bg-[#081423]/95 p-8 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Verified Shopify launch</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Link Shopify to a workspace</h1>
        <p className="mt-4 leading-7 text-slate-300">
          The app installation is verified. Choose the ListingPilot workspace that should receive publishing access for <span className="font-semibold text-white">{intent.shopDomain}</span>.
        </p>
        <form method="post" action="/api/shopify/launch/continue" className="mt-7 space-y-4">
          <input type="hidden" name="intent" value={nonce} />
          {options.ownerWorkspaces.length === 1 ? (
            <>
              <input type="hidden" name="workspaceId" value={options.ownerWorkspaces[0].id} />
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                <p className="font-semibold text-white">{options.ownerWorkspaces[0].name}</p>
                <p className="mt-1 text-sm text-slate-400">{options.ownerWorkspaces[0].organizationName} · Owner</p>
              </div>
            </>
          ) : (
            <fieldset className="space-y-3">
              <legend className="mb-3 text-sm font-semibold text-slate-200">Choose workspace</legend>
              {options.ownerWorkspaces.map((workspace, index) => (
                <label key={workspace.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 p-4 hover:bg-white/[0.04]">
                  <input type="radio" name="workspaceId" value={workspace.id} defaultChecked={index === 0} required />
                  <span>
                    <span className="block font-semibold text-white">{workspace.name}</span>
                    <span className="text-sm text-slate-400">{workspace.organizationName}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <button type="submit" className="w-full rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300">
            Prepare secure Shopify authorization
          </button>
        </form>
        <p className="mt-5 text-xs leading-5 text-slate-500">
          ListingPilot checks for an existing usable connection and requests Shopify authorization only when required.
        </p>
      </section>
    </main>
  );
}
