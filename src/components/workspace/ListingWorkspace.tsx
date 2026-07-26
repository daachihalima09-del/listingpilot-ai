"use client";

import { Download, FolderKanban, Save, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AIDetective } from '@/components/workspace/AIDetective';
import { ActivityTimeline } from '@/components/workspace/ActivityTimeline';
import { CatalogHealth } from '@/components/workspace/CatalogHealth';
import { GeneratedListing } from '@/components/workspace/GeneratedListing';
import { ProductInput, type InputMode } from '@/components/workspace/ProductInput';
import { ProductPipeline } from '@/components/workspace/ProductPipeline';
import { ProductTruthTable } from '@/components/workspace/ProductTruthTable';
import { RecentAnalyses } from '@/components/workspace/RecentAnalyses';
import { Sidebar } from '@/components/workspace/Sidebar';
import { SourceEvidence } from '@/components/workspace/SourceEvidence';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { demoProduct } from '@/data/demo-product';
import type { ProductAnalysis } from '@/lib/analysis-schema';
import { isPdfFileName, isValidHttpUrl, normalizePastedHttpUrl, type DemoAnalysisContext, type DemoAnalysisInput } from '@/lib/demo-analysis-adapter';
import { buildShopifyCsv } from '@/lib/shopify-csv';
import {
  useProjectAutosave,
  type ProjectSaveSnapshot,
  type SavedProjectWorkspace,
} from '@/modules/projects/client/use-project-autosave';
import { ShopifyPublishingPanel } from '@/modules/shopify/components/ShopifyPublishingPanel';
import { ShopifyVariantsPanel } from '@/modules/shopify/components/ShopifyVariantsPanel';
import type {
  ShopifyPublishingContext,
} from '@/modules/shopify/publishing/publication-types';
import type {
  ShopifyVariantConfigurationDto,
} from '@/modules/shopify/variants/variant-validation';
import type { DemoProduct, PipelineStage, TruthRow } from '@/types/product';

const stageOrder: PipelineStage[] = ['input', 'extract', 'verify', 'generate', 'review', 'export'];
const demoSpecs = [
  'Samsung Q80D 4K QLED TV',
  'Brand: Samsung',
  'Model: Q80D',
  'Panel: QLED',
  'HDR: HDR10+',
  'Refresh Rate: 120Hz',
  'Resolution: 4K UHD',
  'Smart Platform: Tizen OS',
  'Warranty: Missing',
  'Key claims: Premium 4K QLED display with verified features and a refined product narrative.',
].join('\n');

class AnalysisRequestError extends Error {}

function buildListingContent(product: DemoProduct = demoProduct) {
  return {
    title: `${product.brand} ${product.model} 4K QLED TV`,
    description: `The ${product.brand} ${product.model} combines a premium QLED panel, ${product.hdr} support, and ${product.refreshRate} motion clarity for a polished home entertainment experience.`,
    keyFeatures: [
      'Premium QLED panel with bright, accurate color',
      'HDR10+ and 4K UHD resolution for cinematic picture quality',
      'Tizen OS smart platform with simple streaming access',
      'Verified premium feature set for Shopify-ready listings',
    ].join('\n'),
    seoTitle: `${product.brand} ${product.model} 4K QLED TV`,
    seoDescription: `${product.brand} ${product.model} offers premium QLED imaging, ${product.hdr} support, and ${product.refreshRate} motion clarity for modern entertainment.`,
    tags: 'samsung,q80d,qled,4k-tv,shopify-ready',
  };
}

function buildUploadedPdfDemoProduct(filename: string): DemoProduct {
  return {
    ...demoProduct,
    sources: [
      {
        name: filename,
        type: 'Uploaded PDF · Demo Mode',
        confidence: 100,
        status: 'Review',
      },
      ...demoProduct.sources,
    ],
  };
}

interface AnalysisSourceOptions {
  name: string;
  type: string;
  noConflictExplanation: string;
}

function buildAnalyzedProduct(analysis: ProductAnalysis, source: AnalysisSourceOptions): DemoProduct {
  const score = analysis.overallConfidence;
  const label = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : 'Needs review';
  const missingFields = new Set(analysis.missingFields.map((field) => field.toLowerCase()));
  const fieldStatus = (field: string) => missingFields.has(field.toLowerCase()) ? 'warning' as const : 'good' as const;
  const conflict = analysis.conflict;

  return {
    ...analysis.product,
    truthRows: analysis.truthRows,
    sources: [
      {
        name: source.name,
        type: source.type,
        confidence: score,
        status: 'Review',
      },
    ],
    conflict: {
      label: conflict?.field ?? '',
      official: conflict?.values[0] ?? '',
      amazon: conflict?.values[1] ?? '',
      lg: conflict?.recommendedValue ?? '',
      recommendation: conflict ? `Use ${conflict.recommendedValue}` : '',
      recommendedValue: conflict?.recommendedValue ?? '',
      explanation: conflict?.explanation ?? source.noConflictExplanation,
    },
    catalogHealth: {
      score,
      label,
      items: [
        { name: 'Specifications', status: analysis.missingFields.length ? 'warning' : 'good' },
        { name: 'Description', status: analysis.listing.description ? 'good' : 'warning' },
        { name: 'SEO', status: analysis.listing.seoTitle && analysis.listing.seoDescription ? 'good' : 'warning' },
        { name: 'Images', status: 'warning' },
        { name: 'Variants', status: 'warning' },
        { name: 'Filters', status: 'good' },
        { name: 'Warranty warning', status: fieldStatus('Warranty') },
      ],
    },
    analyses: [
      {
        title: [analysis.product.brand, analysis.product.model].filter((value) => value && value !== 'Missing').join(' ') || 'Analyzed product',
        status: analysis.missingFields.length ? 'Review' : 'Completed',
        score,
      },
      ...demoProduct.analyses.slice(0, 2),
    ],
  };
}

interface ListingWorkspaceProps {
  initialProject?: SavedProjectWorkspace;
  canManage?: boolean;
  shopifyPublishing?: ShopifyPublishingContext;
  shopifyVariants?: {
    configured: boolean;
    connected: boolean;
    canManage: boolean;
    hasPublishedProduct: boolean;
    configuration: ShopifyVariantConfigurationDto;
  };
}

function projectSourceToInputMode(
  sourceType: SavedProjectWorkspace['sourceType'],
): InputMode {
  switch (sourceType) {
    case 'SUPPLIER_URL':
      return 'url';
    case 'PRODUCT_URL':
      return 'product';
    case 'UPLOADED_PDF':
      return 'pdf';
    default:
      return 'specs';
  }
}

export function ListingWorkspace({
  initialProject,
  canManage = true,
  shopifyPublishing,
  shopifyVariants,
}: ListingWorkspaceProps) {
  const analysisRequestRef = useRef<AbortController | null>(null);
  const restoredAnalysis = initialProject?.analysisData;
  const restoredReadiness = initialProject?.readinessData;
  const restoredProduct = restoredAnalysis?.activeProduct ?? demoProduct;
  const restoredListing = initialProject?.generatedListing && initialProject.seoData
    ? {
        ...initialProject.generatedListing,
        ...initialProject.seoData,
      }
    : buildListingContent(restoredProduct);
  const isReadOnly = Boolean(
    initialProject
    && (!canManage || initialProject.status === 'ARCHIVED'),
  );
  const [inputMode, setInputMode] = useState<InputMode>(
    projectSourceToInputMode(initialProject?.sourceType ?? null),
  );
  const [analysisStarted, setAnalysisStarted] = useState(
    restoredReadiness?.analysisStarted ?? false,
  );
  const [activeStage, setActiveStage] = useState<PipelineStage>(
    restoredReadiness?.activeStage ?? 'input',
  );
  const [completedStages, setCompletedStages] = useState<PipelineStage[]>(
    restoredReadiness?.completedStages ?? [],
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflictResolved, setConflictResolved] = useState(
    restoredAnalysis?.conflictResolved ?? false,
  );
  const [truthRows, setTruthRows] = useState<TruthRow[]>(
    restoredAnalysis?.truthRows ?? restoredProduct.truthRows,
  );
  const initialHasConflict = Boolean(
    analysisStarted
    && !conflictResolved
    && truthRows.some((row) => row.status === 'Conflict'),
  );
  const [hasConflict, setHasConflict] = useState(initialHasConflict);
  const [visibleRows, setVisibleRows] = useState(
    analysisStarted ? truthRows.length : 0,
  );
  const [showSources, setShowSources] = useState(
    analysisStarted ? restoredProduct.sources.length : 0,
  );
  const [showRecommendation, setShowRecommendation] = useState(
    analysisStarted && (initialHasConflict || conflictResolved),
  );
  const [recommendationConfidence, setRecommendationConfidence] = useState(
    truthRows.find((row) => row.status === 'Conflict')?.confidence
      ?? restoredProduct.catalogHealth.score,
  );
  const [shopifyReady, setShopifyReady] = useState(
    restoredReadiness?.shopifyReady ?? false,
  );
  const [reducedMotion, setReducedMotion] = useState(false);
  const [specText, setSpecText] = useState(
    initialProject
      ? initialProject.sourceType === 'RAW_SPECIFICATIONS'
        ? initialProject.rawInput ?? ''
        : ''
      : demoSpecs,
  );
  const [useDemoFallback, setUseDemoFallback] = useState(false);
  const [supplierUrl, setSupplierUrl] = useState(
    initialProject?.sourceType === 'SUPPLIER_URL'
      ? initialProject.sourceUrl ?? ''
      : '',
  );
  const [productUrl, setProductUrl] = useState(
    initialProject?.sourceType === 'PRODUCT_URL'
      ? initialProject.sourceUrl ?? ''
      : '',
  );
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [analysisContext, setAnalysisContext] = useState<DemoAnalysisContext | null>(
    restoredAnalysis?.analysisContext ?? null,
  );
  const [activeProduct, setActiveProduct] = useState<DemoProduct>(restoredProduct);
  const [listingContent, setListingContent] = useState(restoredListing);
  const [hasPublishedShopifyProduct, setHasPublishedShopifyProduct] = useState(
    shopifyVariants?.hasPublishedProduct ?? false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => () => {
    analysisRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!analysisStarted || !isRunning) {
      return;
    }

    const nextStage = stageOrder[completedStages.length];
    if (!nextStage) {
      return;
    }

    const timer = window.setTimeout(() => {
      const analysisHasConflict = truthRows.some((row) => row.status === 'Conflict');
      setActiveStage(nextStage);
      setCompletedStages((prev) => (prev.includes(nextStage) ? prev : [...prev, nextStage]));

      if (nextStage === 'extract') {
        setVisibleRows(Math.min(2, truthRows.length));
      } else if (nextStage === 'verify') {
        setHasConflict(analysisHasConflict);
        setVisibleRows(Math.min(4, truthRows.length));
        setShowSources(Math.min(1, activeProduct.sources.length));
      } else if (nextStage === 'generate') {
        setVisibleRows(Math.min(6, truthRows.length));
        setShowSources(Math.min(2, activeProduct.sources.length));
      } else if (nextStage === 'review') {
        setVisibleRows(truthRows.length);
        setShowSources(Math.min(3, activeProduct.sources.length));
        setShowRecommendation(analysisHasConflict);
        setRecommendationConfidence(
          truthRows.find((row) => row.status === 'Conflict')?.confidence ?? activeProduct.catalogHealth.score,
        );
      } else if (nextStage === 'export') {
        setShopifyReady(true);
        setVisibleRows(truthRows.length);
        setIsRunning(false);
      }
    }, reducedMotion ? 250 : 1300);

    return () => window.clearTimeout(timer);
  }, [activeProduct, analysisStarted, completedStages.length, isRunning, reducedMotion, truthRows]);

  const canAnalyze = useMemo(() => {
    if (inputMode === 'specs') {
      return Boolean(specText.trim());
    }

    if (inputMode === 'url') {
      return isValidHttpUrl(supplierUrl);
    }

    if (inputMode === 'product') {
      return isValidHttpUrl(productUrl);
    }

    return Boolean(selectedPdf);
  }, [inputMode, productUrl, selectedPdf, specText, supplierUrl]);

  const handleModeChange = (mode: typeof inputMode) => {
    if (isReadOnly) {
      return;
    }
    setInputMode(mode);
    setInputError(null);
  };

  const handleUrlChange = (mode: 'url' | 'product', value: string) => {
    if (isReadOnly) {
      return;
    }
    const normalizedValue = normalizePastedHttpUrl(value);
    if (mode === 'url') {
      setSupplierUrl(normalizedValue);
    } else {
      setProductUrl(normalizedValue);
    }
    setInputError(null);
  };

  const handlePdfChange = (file: File | null) => {
    if (isReadOnly) {
      return;
    }
    if (!file) {
      setSelectedPdf(null);
      setInputError(null);
      return;
    }

    if (!isPdfFileName(file.name)) {
      setSelectedPdf(null);
      setInputError('Choose a PDF file. Other file types are not supported.');
      return;
    }

    setSelectedPdf(file);
    setInputError(null);
  };

  const getAnalysisInput = (): DemoAnalysisInput | null => {
    if (inputMode === 'specs') {
      if (!specText.trim()) {
        setInputError('Paste product specifications before analyzing.');
        return null;
      }
      return { kind: 'raw-specifications' };
    }

    if (inputMode === 'url') {
      if (!isValidHttpUrl(supplierUrl)) {
        setInputError('Enter a valid supplier URL beginning with http:// or https://.');
        return null;
      }
      return { kind: 'supplier-url', url: supplierUrl.trim() };
    }

    if (inputMode === 'product') {
      if (!isValidHttpUrl(productUrl)) {
        setInputError('Enter a valid product URL beginning with http:// or https://.');
        return null;
      }
      return { kind: 'product-url', url: productUrl.trim() };
    }

    if (!selectedPdf) {
      setInputError('Choose a PDF file before analyzing.');
      return null;
    }
    return { kind: 'uploaded-pdf', filename: selectedPdf.name };
  };

  const resetAnalysisResults = () => {
    setAnalysisStarted(false);
    setActiveStage('input');
    setCompletedStages([]);
    setIsRunning(false);
    setHasConflict(false);
    setConflictResolved(false);
    setVisibleRows(0);
    setShowSources(0);
    setShowRecommendation(false);
    setRecommendationConfidence(0);
    setShopifyReady(false);
  };

  const startPipeline = (
    product: DemoProduct,
    listing: ReturnType<typeof buildListingContent>,
    context: DemoAnalysisContext,
  ) => {
    setActiveProduct(product);
    setTruthRows(product.truthRows);
    setListingContent(listing);
    setAnalysisContext(context);
    setAnalysisStarted(true);
    setActiveStage('input');
    setCompletedStages([]);
    setIsRunning(true);
  };

  const handleAnalyze = async () => {
    if (isReadOnly || analysisRequestRef.current || isRunning) {
      return;
    }

    const analysisInput = getAnalysisInput();
    if (!analysisInput) {
      return;
    }

    setInputError(null);
    resetAnalysisResults();

    const useLiveAnalysis = analysisInput.kind !== 'uploaded-pdf'
      && (analysisInput.kind !== 'raw-specifications' || !useDemoFallback);

    if (!useLiveAnalysis) {
      const demoAnalysisProduct = analysisInput.kind === 'raw-specifications'
        ? demoProduct
        : buildUploadedPdfDemoProduct(analysisInput.filename);
      startPipeline(
        demoAnalysisProduct,
        buildListingContent(demoAnalysisProduct),
        analysisInput.kind === 'raw-specifications'
          ? {
              sourceLabel: 'Raw specifications',
              notice: 'Deterministic demo analysis loaded as a fallback',
            }
          : {
              sourceLabel: 'Uploaded PDF',
              notice: `Demo Mode — live PDF extraction coming soon. Demo analysis generated from uploaded PDF: ${analysisInput.filename}`,
            },
      );
      return;
    }

    setIsSubmitting(true);
    const requestController = new AbortController();
    analysisRequestRef.current = requestController;
    const requestTimeout = window.setTimeout(() => requestController.abort(), 85_000);

    try {
      const requestBody = analysisInput.kind === 'raw-specifications'
        ? { source: 'raw-specifications' as const, specifications: specText.trim() }
        : { source: analysisInput.kind, url: analysisInput.url };
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: requestController.signal,
      });
      let payload: ProductAnalysis | { error?: string };
      try {
        const decodedPayload = await response.json() as unknown;
        if (!decodedPayload || typeof decodedPayload !== 'object' || Array.isArray(decodedPayload)) {
          throw new Error('INVALID_RESPONSE');
        }
        payload = decodedPayload as ProductAnalysis | { error?: string };
      } catch {
        throw new AnalysisRequestError('The analysis service returned an invalid response. Please try again.');
      }

      if (!response.ok || 'error' in payload) {
        throw new AnalysisRequestError('error' in payload && payload.error
          ? payload.error
          : 'Unable to analyze the product input.');
      }

      const analysis = payload as ProductAnalysis;
      const sourceName = analysisInput.kind === 'raw-specifications'
        ? 'Pasted specifications'
        : analysisInput.url;
      const sourceType = analysisInput.kind === 'raw-specifications'
        ? 'User input'
        : analysisInput.kind === 'supplier-url' ? 'Supplier URL' : 'Product URL';
      const product = buildAnalyzedProduct(
        analysis,
        {
          name: sourceName,
          type: sourceType,
          noConflictExplanation: `No conflicting values were found in the ${sourceType.toLowerCase()}.`,
        },
      );
      startPipeline(
        product,
        analysis.listing,
        {
          sourceLabel: analysisInput.kind === 'raw-specifications'
            ? 'Raw specifications'
            : analysisInput.kind === 'supplier-url' ? 'Supplier URL' : 'Product URL',
          notice: analysisInput.kind === 'raw-specifications'
            ? 'OpenAI analysis generated from the supplied raw specifications'
            : `OpenAI analysis generated from the extracted ${sourceType.toLowerCase()}`,
        },
      );
    } catch (error) {
      setInputError(error instanceof Error && error.name === 'AbortError'
        ? 'The analysis request timed out. Please try again.'
        : error instanceof AnalysisRequestError
          ? error.message
          : 'Unable to analyze the product input. Please try again.');
    } finally {
      window.clearTimeout(requestTimeout);
      if (analysisRequestRef.current === requestController) {
        analysisRequestRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  const handleLoadDemoProduct = () => {
    if (isReadOnly) {
      return;
    }
    setInputMode('specs');
    setSpecText(demoSpecs);
    setUseDemoFallback(true);
    setInputError(null);
  };

  const handleResolveConflict = () => {
    if (
      isReadOnly
      || !activeProduct.conflict.label
      || !activeProduct.conflict.recommendedValue
    ) {
      return;
    }

    setConflictResolved(true);
    setHasConflict(false);
    setTruthRows((prev) => prev.map((row) => (
      row.field === activeProduct.conflict.label
        ? {
            ...row,
            status: 'Verified',
            value: activeProduct.conflict.recommendedValue,
            source: activeProduct === demoProduct
              ? 'Samsung Official Website'
              : `AI recommendation from ${activeProduct.sources[0]?.name ?? 'analyzed input'}`,
            confidence: Math.max(row.confidence, recommendationConfidence),
          }
        : row
    )));
    setShowRecommendation(true);
  };

  const handleExport = () => {
    const csv = buildShopifyCsv(activeProduct, listingContent);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'listingpilot-shopify-export.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const overview = useMemo(() => {
    const score = conflictResolved
      ? Math.min(100, activeProduct.catalogHealth.score + 2)
      : activeProduct.catalogHealth.score;
    const label = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : 'Needs review';
    return {
      score,
      label,
      items: activeProduct.catalogHealth.items.map((item) => ({
        ...item,
        status: item.status === 'warning' && conflictResolved ? 'good' : item.status,
      })),
    };
  }, [activeProduct, conflictResolved]);

  const projectSnapshot = useMemo<ProjectSaveSnapshot>(() => {
    const sourceType = inputMode === 'url'
      ? 'SUPPLIER_URL' as const
      : inputMode === 'product'
        ? 'PRODUCT_URL' as const
        : inputMode === 'pdf'
          ? 'UPLOADED_PDF' as const
          : 'RAW_SPECIFICATIONS' as const;
    const sourceUrl = inputMode === 'url'
      ? supplierUrl.trim() || null
      : inputMode === 'product'
        ? productUrl.trim() || null
        : null;
    const rawInput = inputMode === 'specs'
      ? specText
      : inputMode === 'pdf'
        ? selectedPdf?.name ?? initialProject?.rawInput ?? null
        : null;

    return {
      sourceType,
      sourceUrl,
      rawInput,
      analysisData: analysisStarted
        ? {
            activeProduct,
            truthRows,
            analysisContext,
            conflictResolved,
          }
        : null,
      generatedListing: {
        title: listingContent.title,
        description: listingContent.description,
        keyFeatures: listingContent.keyFeatures,
      },
      seoData: {
        seoTitle: listingContent.seoTitle,
        seoDescription: listingContent.seoDescription,
        tags: listingContent.tags,
      },
      readinessData: {
        analysisStarted,
        activeStage,
        completedStages,
        shopifyReady,
      },
    };
  }, [
    activeProduct,
    activeStage,
    analysisContext,
    analysisStarted,
    completedStages,
    conflictResolved,
    initialProject?.rawInput,
    inputMode,
    listingContent,
    productUrl,
    selectedPdf?.name,
    shopifyReady,
    specText,
    supplierUrl,
    truthRows,
  ]);
  const projectSave = useProjectAutosave({
    project: initialProject ?? null,
    snapshot: projectSnapshot,
    enabled: Boolean(initialProject && canManage && initialProject.status !== 'ARCHIVED'),
  });

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col min-[1700px]:flex-row">
        <Sidebar />
        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
                {initialProject
                  ? <FolderKanban className="h-4 w-4" aria-hidden="true" />
                  : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {initialProject?.name ?? 'ListingPilot AI'}
                </p>
                <p className="text-xs text-slate-400">
                  {initialProject ? 'Saved project workspace' : 'Product truth workspace'}
                </p>
              </div>
            </div>
            <nav className="flex flex-wrap items-center justify-end gap-2 text-sm text-slate-300">
              <Link href="/about" className="rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white">
                About
              </Link>
              <Link
                href={initialProject
                  ? `/projects?${new URLSearchParams({
                      organizationId: initialProject.organizationId,
                      workspaceId: initialProject.workspaceId,
                    })}`
                  : '/projects'}
                className="rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white"
              >
                Saved Projects
              </Link>
              <Link href="/settings/organization" className="rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white">
                Settings
              </Link>
              {initialProject ? (
                <>
                  <span
                    role="status"
                    aria-live="polite"
                    className={`rounded-full border px-3 py-2 text-xs ${
                      projectSave.status === 'error' || projectSave.status === 'conflict'
                        ? 'border-rose-400/20 bg-rose-400/10 text-rose-200'
                        : projectSave.status === 'saving' || projectSave.status === 'pending'
                          ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
                          : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                    }`}
                  >
                    {projectSave.message}
                  </span>
                  {!isReadOnly ? (
                    <button
                      type="button"
                      onClick={projectSave.saveNow}
                      disabled={projectSave.status === 'saving' || projectSave.status === 'conflict'}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Save now
                    </button>
                  ) : null}
                </>
              ) : null}
              <SignOutButton />
              <Link
                href={initialProject
                  ? `/projects/new?${new URLSearchParams({
                      organizationId: initialProject.organizationId,
                      workspaceId: initialProject.workspaceId,
                    })}`
                  : '/projects/new'}
                className="rounded-full border border-white/10 bg-white/10 px-3 py-2 transition hover:bg-white/15"
              >
                New project
              </Link>
            </nav>
          </header>

          {isReadOnly ? (
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {initialProject?.status === 'ARCHIVED'
                ? 'This project is archived. Restore it from Saved Projects before editing.'
                : 'You have read-only access to this project.'}
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="min-w-0 space-y-6">
              <ProductInput
                inputMode={inputMode}
                onModeChange={handleModeChange}
                onAnalyze={handleAnalyze}
                analysisStarted={analysisStarted}
                isRunning={isRunning || isSubmitting}
                canAnalyze={canAnalyze}
                specText={specText}
                onSpecTextChange={(value) => {
                  setSpecText(value);
                  setUseDemoFallback(false);
                  setInputError(null);
                }}
                supplierUrl={supplierUrl}
                productUrl={productUrl}
                onUrlChange={handleUrlChange}
                selectedPdf={selectedPdf}
                onPdfChange={handlePdfChange}
                onLoadDemoProduct={handleLoadDemoProduct}
                inputError={inputError}
                readOnly={isReadOnly}
              />

              <ProductPipeline
                activeStage={activeStage}
                completedStages={completedStages}
                isRunning={isRunning}
                hasConflict={hasConflict}
              />

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="min-w-0 space-y-6">
                  <ActivityTimeline currentIndex={stageOrder.indexOf(activeStage)} completedCount={completedStages.length} hasConflict={hasConflict} />
                  <SourceEvidence sources={activeProduct.sources} />
                </div>
                <div className="min-w-0 space-y-6">
                  <AIDetective
                    product={activeProduct}
                    hasConflict={hasConflict}
                    conflictResolved={conflictResolved}
                    onResolve={handleResolveConflict}
                    visibleSourcesCount={showSources}
                    recommendationConfidence={recommendationConfidence}
                    showRecommendation={showRecommendation}
                    readOnly={isReadOnly}
                  />
                  <CatalogHealth product={{ ...activeProduct, catalogHealth: { ...activeProduct.catalogHealth, score: overview.score, label: overview.label, items: overview.items } }} />
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-6">
              <section className="relative overflow-hidden rounded-[1.75rem] border border-amber-400/20 bg-[#081423] p-5">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,199,76,0.16),transparent_45%)]" />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">SHOPIFY READY</div>
                    <div className="mt-2 text-sm text-slate-400">Your catalog is ready to export to Shopify.</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${shopifyReady ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-white/10 bg-white/5 text-slate-400'}`}>
                    {shopifyReady ? 'Ready' : 'Stand by'}
                  </span>
                </div>
                {analysisContext ? (
                  <div className="relative mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">{analysisContext.sourceLabel}</div>
                    <div className="mt-1 text-sm text-slate-300">{analysisContext.notice}</div>
                  </div>
                ) : null}
                <div className="relative mt-5 rounded-[1.25rem] border border-white/10 bg-[#07111f] p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Export envelope</div>
                  <div className="mt-2 text-xl font-semibold text-slate-100">{activeProduct.brand} {activeProduct.model} • {activeProduct.refreshRate}</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">{overview.score}% Overall Quality</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">Verified Facts</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">SEO Ready</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">Variant Ready</div>
                  </div>
                </div>

                <div className="relative mt-5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleExport}
                    disabled={!shopifyReady}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${shopifyReady ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'}`}
                  >
                    <Download className="h-4 w-4" />
                    EXPORT SHOPIFY CSV
                  </button>
                  <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300">
                    {shopifyReady ? `${overview.score}% Ready to Export` : 'Awaiting validation'}
                  </div>
                </div>
              </section>

              <GeneratedListing
                content={listingContent}
                onChange={(field, value) => {
                  if (!isReadOnly) {
                    setListingContent((prev) => ({ ...prev, [field]: value }));
                  }
                }}
                readOnly={isReadOnly}
              />
              {initialProject && shopifyPublishing ? (
                <ShopifyPublishingPanel
                  projectId={initialProject.id}
                  source={{
                    listing: {
                      title: listingContent.title,
                      description: listingContent.description,
                      tags: listingContent.tags,
                    },
                    product: {
                      brand: activeProduct.brand,
                    },
                  }}
                  initialContext={shopifyPublishing}
                  onPublicationChange={setHasPublishedShopifyProduct}
                />
              ) : null}
              {initialProject && shopifyVariants ? (
                <ShopifyVariantsPanel
                  projectId={initialProject.id}
                  configured={shopifyVariants.configured}
                  connected={shopifyVariants.connected}
                  canManage={shopifyVariants.canManage}
                  hasPublishedProduct={hasPublishedShopifyProduct}
                  initialConfiguration={shopifyVariants.configuration}
                />
              ) : null}
              <ProductTruthTable rows={truthRows} visibleCount={visibleRows} />
              <RecentAnalyses product={activeProduct} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
