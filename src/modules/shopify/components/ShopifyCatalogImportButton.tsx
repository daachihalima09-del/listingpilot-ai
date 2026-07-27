'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ShopifyCatalogImportButton({
  productId,
}: {
  productId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function importProduct() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/shopify/catalog/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const payload = await response.json() as {
        projectId?: unknown;
        error?: { message?: unknown };
      };
      if (!response.ok || typeof payload.projectId !== 'string') {
        setError(
          typeof payload.error?.message === 'string'
            ? payload.error.message
            : 'The product could not be imported.',
        );
        return;
      }
      router.push(`/workspace/${encodeURIComponent(payload.projectId)}?notice=shopify-import`);
    } catch {
      setError('The product could not be imported.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void importProduct()}
        disabled={busy}
        aria-busy={busy}
        className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Importing…' : 'Import to ListingPilot'}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

