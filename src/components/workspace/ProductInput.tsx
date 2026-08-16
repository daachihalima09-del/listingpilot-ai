"use client";

import { ArrowRight, FileText, Link2, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { useRef } from 'react';
import { isValidHttpUrl } from '@/lib/demo-analysis-adapter';

export type InputMode = 'url' | 'product' | 'specs' | 'pdf';

interface ProductInputProps {
  inputMode: InputMode;
  onModeChange: (mode: InputMode) => void;
  onAnalyze: () => void;
  analysisStarted: boolean;
  isRunning: boolean;
  canAnalyze: boolean;
  specText: string;
  onSpecTextChange: (value: string) => void;
  supplierUrl: string;
  productUrl: string;
  onUrlChange: (mode: 'url' | 'product', value: string) => void;
  selectedPdf: File | null;
  onPdfChange: (file: File | null) => void;
  inputError: string | null;
  readOnly?: boolean;
  entryMode?: boolean;
}

const modes = [
  { key: 'product' as const, label: 'Add from a link', description: 'Manufacturer, supplier, retailer, Amazon, or Product page' },
  { key: 'specs' as const, label: 'Paste product information', description: 'Specifications, supplier information, or other Product details' },
  { key: 'pdf' as const, label: 'Upload document', description: 'Product specification or supplier document' },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProductInput({
  inputMode,
  onModeChange,
  onAnalyze,
  analysisStarted,
  isRunning,
  canAnalyze,
  specText,
  onSpecTextChange,
  supplierUrl,
  productUrl,
  onUrlChange,
  selectedPdf,
  onPdfChange,
  inputError,
  readOnly = false,
  entryMode = false,
}: ProductInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsDisabled = isRunning || readOnly;
  const activeUrl = inputMode === 'product' ? productUrl : supplierUrl;
  const urlError = activeUrl.trim() && !isValidHttpUrl(activeUrl)
    ? 'Enter a valid URL beginning with http:// or https://.'
    : null;

  const handlePdfClick = () => {
    fileInputRef.current?.click();
  };

  const handlePdfSelection = (file: File | undefined) => {
    if (!file) {
      return;
    }

    onPdfChange(file);
  };

  const handleRemovePdf = () => {
    onPdfChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <section aria-labelledby={entryMode ? 'project-entry-title' : undefined} className="relative max-w-full overflow-hidden rounded-[2rem] border border-amber-400/20 bg-[#0b1728] p-5 shadow-soft sm:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,199,76,0.16),transparent_40%)]" />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">How do you want to add this Product?</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {modes.map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => onModeChange(mode.key)}
              disabled={controlsDisabled}
              aria-pressed={inputMode === mode.key || (mode.key === 'product' && inputMode === 'url')}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                inputMode === mode.key || (mode.key === 'product' && inputMode === 'url') ? 'border-amber-300/40 bg-amber-400/15 text-amber-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="block font-semibold">{mode.label}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{mode.description}</span>
            </button>
          ))}
        </div>

        <h1 id={entryMode ? 'project-entry-title' : undefined} className="mt-6 text-3xl font-semibold leading-tight sm:text-4xl">
          {entryMode ? 'Add your Product' : 'Product information'}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
          {entryMode
            ? 'Choose the easiest source. ListingPilot will analyze it and prepare the Product workspace.'
            : 'Update the Product source or run analysis again when needed.'}
        </p>
        {inputMode === 'pdf' ? (
          <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100">
            <span className="font-semibold uppercase tracking-[0.14em] text-amber-300">Not available yet</span>
            <span className="text-slate-300">Use a URL or raw specifications for live analysis</span>
          </div>
        ) : inputMode === 'url' || inputMode === 'product' ? (
          <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100">
            <span className="font-semibold uppercase tracking-[0.14em] text-emerald-300">Live Analysis</span>
            <span className="text-slate-300">Page content will be extracted and analyzed securely</span>
          </div>
        ) : null}

        <div className="mt-6 space-y-3 rounded-[1.25rem] border border-white/10 bg-[#081423] p-3">
          {inputMode === 'specs' ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
              <div className="mb-2 flex items-center gap-2 text-slate-200">
                <FileText className="h-4 w-4 text-amber-300" />
                Product information
              </div>
              <textarea
                value={specText}
                onChange={(event) => onSpecTextChange(event.target.value)}
                disabled={controlsDisabled}
                className="min-h-28 w-full resize-none rounded-lg border border-white/10 bg-[#07111f] px-3 py-3 text-sm outline-none focus:border-amber-400/50"
                placeholder="Paste specifications, supplier information, features, dimensions, certifications, and other Product details..."
              />
            </div>
          ) : inputMode === 'pdf' ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-3 text-sm text-slate-200">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => {
                  handlePdfSelection(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
                className="sr-only"
              />
              {selectedPdf ? (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-100">{selectedPdf.name}</div>
                    <div className="mt-1 text-xs text-slate-500">PDF · {formatFileSize(selectedPdf.size)} · kept on this device</div>
                  </div>
                  <button type="button" onClick={handlePdfClick} disabled={controlsDisabled} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                    <RefreshCw className="h-3.5 w-3.5" /> Change file
                  </button>
                  <button type="button" onClick={handleRemovePdf} disabled={controlsDisabled} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              ) : (
                <button type="button" onClick={handlePdfClick} disabled={controlsDisabled} className="flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50">
                  <UploadCloud className="h-4 w-4 text-amber-300" />
                  <span className="flex-1">Choose a PDF file</span>
                  <span className="text-slate-500">Selected locally; analysis is unavailable</span>
                </button>
              )}
            </div>
          ) : (
            <label className="block rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
              <span className="mb-2 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-amber-300" />
                Product link
              </span>
              <input
                type="url"
                inputMode="url"
                value={activeUrl}
                onChange={(event) => onUrlChange(inputMode, event.target.value)}
                disabled={controlsDisabled}
                className="w-full rounded-lg border border-white/10 bg-[#07111f] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-400/50"
                placeholder="https://example.com/product"
                aria-invalid={Boolean(urlError || inputError)}
              />
              {urlError ? <span className="mt-2 block text-xs text-rose-300">{urlError}</span> : null}
            </label>
          )}
          {inputError ? <p className="px-1 text-xs text-rose-300" role="alert">{inputError}</p> : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!canAnalyze || controlsDisabled}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              canAnalyze && !controlsDisabled
                ? analysisStarted ? 'bg-amber-500/80 text-slate-950 hover:bg-amber-400' : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                : 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'
            }`}
          >
            {isRunning ? 'Analyzing…' : 'Analyze Product'} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
