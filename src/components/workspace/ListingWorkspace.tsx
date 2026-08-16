"use client";

import { Download, FolderKanban, Save, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AIDetective } from '@/components/workspace/AIDetective';
import { ActivityTimeline } from '@/components/workspace/ActivityTimeline';
import { CatalogHealth } from '@/components/workspace/CatalogHealth';
import { applicableReadinessRows } from '@/components/workspace/category-readiness';
import { GeneratedListing } from '@/components/workspace/GeneratedListing';
import { ProductInput, type InputMode } from '@/components/workspace/ProductInput';
import { ProductPipeline } from '@/components/workspace/ProductPipeline';
import { ProductTruthTable } from '@/components/workspace/ProductTruthTable';
import { RecentAnalyses } from '@/components/workspace/RecentAnalyses';
import { Sidebar } from '@/components/workspace/Sidebar';
import { SourceEvidence } from '@/components/workspace/SourceEvidence';
import { shouldShowProjectEntry } from '@/components/workspace/project-entry-state';
import { SignOutButton } from '@/components/auth/SignOutButton';
import {
  buildDemoListingContent,
  demoProduct,
  demoProductSpecifications,
} from '@/data/demo-product';
import type { ProductAnalysis } from '@/lib/analysis-schema';
import type {
  CanonicalGenerationEligibility,
  GenerationEligibilityFinding,
} from '@/modules/listing-generation';
import { isPdfFileName, isValidHttpUrl, normalizePastedHttpUrl, type DemoAnalysisContext, type DemoAnalysisInput } from '@/lib/demo-analysis-adapter';
import { buildShopifyCsv } from '@/lib/shopify-csv';
import type { DraftRegenerationSection } from '@/modules/listing-draft';
import type { ListingDraftInput } from '@/modules/listing-draft';
import {
  listingDraftProjectFields,
  readAuthoritativeListingDraft,
} from '@/modules/listing-draft/persistence/authoritative-draft-state';
import { ListingDraftReview } from '@/modules/listing-draft/review/ListingDraftReview';
import {
  useProjectAutosave,
  type ProjectSaveSnapshot,
  type SavedProjectWorkspace,
} from '@/modules/projects/client/use-project-autosave';
import { ProjectApiError, projectApiRequest } from '@/modules/projects/client/project-api';
import { ShopifyPublishingPanel } from '@/modules/shopify/components/ShopifyPublishingPanel';
import { ShopifyListingPreview } from '@/modules/shopify/components/ShopifyListingPreview';
import { assembleShopifyListing } from '@/modules/shopify/content/shopify-description';
import { ShopifyVariantsPanel } from '@/modules/shopify/components/ShopifyVariantsPanel';
import { ShopifyMetafieldsPanel } from '@/modules/shopify/components/ShopifyMetafieldsPanel';
import { ShopifyImagesPanel } from '@/modules/shopify/components/ShopifyImagesPanel';
import {
  ShopifyPublicationCoordinatorPanel,
} from '@/modules/shopify/components/ShopifyPublicationCoordinatorPanel';
import type {
  ShopifyMetafieldConfigurationDto,
} from '@/modules/shopify/metafields/metafield-repository';
import type {
  ShopifyImageConfigurationDto,
} from '@/modules/shopify/images/image-repository';
import type {
  CoordinatorExecutionDto,
} from '@/modules/shopify/coordinator/coordinator-types';
import type {
  ShopifyPublishingContext,
} from '@/modules/shopify/publishing/publication-types';
import type {
  ShopifyVariantConfigurationDto,
} from '@/modules/shopify/variants/variant-validation';
import type { DemoProduct, PipelineStage, TruthRow } from '@/types/product';

const stageOrder: PipelineStage[] = ['input', 'extract', 'verify', 'generate', 'review', 'export'];
const workspaceTabs = [
  { id: 'OVERVIEW', label: 'Overview' },
  { id: 'LISTING', label: 'Listing' },
  { id: 'IMAGES', label: 'Images' },
  { id: 'METAFIELDS', label: 'Metafields' },
  { id: 'SHOPIFY', label: 'Shopify' },
  { id: 'ADVANCED', label: 'Advanced' },
] as const;
type WorkspaceTab = typeof workspaceTabs[number]['id'];
const emptyProduct: DemoProduct = {
  brand: '',
  model: '',
  panel: '',
  hdr: '',
  refreshRate: '',
  resolution: '',
  smartPlatform: '',
  warranty: '',
  truthRows: [],
  sources: [],
  conflict: {
    label: '',
    official: '',
    amazon: '',
    lg: '',
    recommendation: '',
    recommendedValue: '',
    explanation: '',
  },
  catalogHealth: { score: 0, label: 'Not analyzed', items: [] },
  analyses: [],
};

const emptyListingContent = {
  title: '',
  description: '',
  keyFeatures: '',
  seoTitle: '',
  seoDescription: '',
  tags: '',
};

type EligibilityRefreshStatus = 'idle' | 'loading' | 'success' | 'error';
const ELIGIBILITY_TIMEOUT_MS = 8_000;
const GENERATION_TIMEOUT_MS = 90_000;

class AnalysisRequestError extends Error {}

interface AnalysisSourceOptions {
  name: string;
  type: string;
  noConflictExplanation: string;
}

function buildAnalyzedProduct(analysis: ProductAnalysis, source: AnalysisSourceOptions): DemoProduct {
  const score = analysis.overallConfidence;
  const label = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : 'Needs review';
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
        { name: 'Product facts', status: analysis.missingFields.length || conflict ? 'warning' : 'good' },
        { name: 'Description', status: analysis.listing.description ? 'good' : 'warning' },
        { name: 'SEO', status: analysis.listing.seoTitle && analysis.listing.seoDescription ? 'good' : 'warning' },
        { name: 'Images', status: 'warning' },
        { name: 'Variants', status: 'warning' },
      ],
    },
    analyses: [
      {
        title: [analysis.product.brand, analysis.product.model].filter((value) => value && value !== 'Missing').join(' ') || 'Analyzed product',
        status: analysis.missingFields.length ? 'Review' : 'Completed',
        score,
      },
    ],
  };
}

function GenerationFindingList({
  findings,
  onReviewProductTruth,
}: {
  findings: readonly GenerationEligibilityFinding[];
  onReviewProductTruth: () => void;
}) {
  return (
    <ul className="mt-3 space-y-3">
      {findings.map((finding) => (
        <li key={finding.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
          <p className="text-sm font-semibold text-white">{finding.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-300">{finding.explanation}</p>
          {finding.resolutionArea === 'PRODUCT_TRUTH' ? (
            <button type="button" onClick={onReviewProductTruth} className="mt-2 text-xs font-semibold text-amber-200 hover:text-amber-100">
              Review Product Truth →
            </button>
          ) : finding.resolutionArea === 'MERCHANT_PROFILE' ? (
            <Link href="/settings/business-profile" className="mt-2 inline-block text-xs font-semibold text-amber-200 hover:text-amber-100">
              Review merchant settings →
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function GenerationEligibilityPanel({
  eligibility,
  current,
  refreshStatus,
  onRetry,
  onReviewProductTruth,
}: {
  eligibility: CanonicalGenerationEligibility | null;
  current: boolean;
  refreshStatus: EligibilityRefreshStatus;
  onRetry: () => void;
  onReviewProductTruth: () => void;
}) {
  if (!current) {
    if (refreshStatus === 'error') {
      return (
        <div role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.08] p-4">
          <p className="font-semibold text-rose-100">Could not refresh listing readiness.</p>
          <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-rose-200/20 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-200/10">
            Try again
          </button>
        </div>
      );
    }
    return <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">Checking generation safety against the latest saved analysis…</div>;
  }
  if (!eligibility) return null;
  if (!eligibility.canGenerate) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.08] p-4">
        <p className="font-semibold text-rose-100">Listing needs attention</p>
        <p className="mt-1 text-sm text-rose-200">{eligibility.blockingFindings.length} {eligibility.blockingFindings.length === 1 ? 'issue must' : 'issues must'} be resolved before a listing can be generated.</p>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300">Review issues</summary>
          <GenerationFindingList findings={eligibility.blockingFindings} onReviewProductTruth={onReviewProductTruth} />
        </details>
      </div>
    );
  }
  if (!eligibility.warnings.length) {
    return <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4"><p className="font-semibold text-emerald-100">Ready to generate</p><p className="mt-1 text-sm text-slate-300">Product analysis is complete.</p></div>;
  }
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4">
      <p className="font-semibold text-amber-100">Ready to generate</p>
      <p className="mt-1 text-sm text-slate-300">Your Product analysis is complete.</p>
      <p className="mt-2 text-sm font-medium text-amber-100">{eligibility.warnings.length} optional {eligibility.warnings.length === 1 ? 'detail' : 'details'}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">View details</summary>
        <GenerationFindingList findings={eligibility.warnings} onReviewProductTruth={onReviewProductTruth} />
      </details>
    </div>
  );
}

interface ListingWorkspaceProps {
  initialProject?: SavedProjectWorkspace;
  canManage?: boolean;
  listingStyle?: {
    standardId: string;
    standardName: string;
    fingerprint: string;
  };
  generationEligibility?: CanonicalGenerationEligibility | null;
  generationEligibilityVersion?: number;
  shopifyPublishing?: ShopifyPublishingContext;
  shopifyCoordinator?: {
    configured: boolean;
    connected: boolean;
    canManage: boolean;
    coordinator: CoordinatorExecutionDto;
  };
  shopifyVariants?: {
    configured: boolean;
    connected: boolean;
    canManage: boolean;
    hasPublishedProduct: boolean;
    configuration: ShopifyVariantConfigurationDto;
  };
  shopifyMetafields?: {
    configured: boolean;
    connected: boolean;
    canManage: boolean;
    hasPublishedProduct: boolean;
    configuration: ShopifyMetafieldConfigurationDto;
  };
  shopifyImages?: {
    configured: boolean;
    connected: boolean;
    canManage: boolean;
    hasPublishedProduct: boolean;
    configuration: ShopifyImageConfigurationDto;
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
  listingStyle,
  generationEligibility: initialGenerationEligibility = null,
  generationEligibilityVersion: initialGenerationEligibilityVersion,
  shopifyPublishing,
  shopifyCoordinator,
  shopifyVariants,
  shopifyMetafields,
  shopifyImages,
}: ListingWorkspaceProps) {
  const router = useRouter();
  const productApiBase = initialProject?.containerProjectId
    ? `/api/projects/${initialProject.containerProjectId}/products/${initialProject.id}`
    : initialProject ? `/api/projects/${initialProject.id}` : null;
  const productWorkspaceBase = initialProject?.containerProjectId
    ? `/workspace/${initialProject.containerProjectId}/products/${initialProject.id}`
    : initialProject ? `/workspace/${initialProject.id}` : null;
  const analysisRequestRef = useRef<AbortController | null>(null);
  const generationRequestRef = useRef(false);
  const eligibilityRequestRef = useRef<{ key: string; controller: AbortController } | null>(null);
  const restoredAnalysis = initialProject?.analysisData;
  const restoredReadiness = initialProject?.readinessData;
  const restoredDraft = readAuthoritativeListingDraft(initialProject?.generatedListing);
  const restoredProduct = restoredAnalysis?.activeProduct
    ?? (initialProject ? emptyProduct : demoProduct);
  const restoredListing = restoredDraft
    ? {
        title: restoredDraft.title.value,
        description: restoredDraft.overview.value,
        keyFeatures: restoredDraft.features.map(({ value }) => value).join('\n'),
        seoTitle: restoredDraft.seo.title.value,
        seoDescription: restoredDraft.seo.description.value,
        tags: restoredDraft.catalog.tags.map(({ value }) => value).join(', '),
      }
    : !initialProject
      ? buildDemoListingContent(restoredProduct)
      : emptyListingContent;
  const isReadOnly = Boolean(
    initialProject
    && (!canManage || initialProject.status === 'ARCHIVED'),
  );
  const [inputMode, setInputMode] = useState<InputMode>(
    initialProject?.sourceType
      ? projectSourceToInputMode(initialProject.sourceType)
      : initialProject ? 'product' : 'specs',
  );
  const [shopifyPanelGeneration, setShopifyPanelGeneration] = useState(0);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('OVERVIEW');
  const [generationEligibility, setGenerationEligibility] = useState(initialGenerationEligibility);
  const [generationEligibilityVersion, setGenerationEligibilityVersion] = useState(
    initialGenerationEligibilityVersion ?? initialProject?.version ?? null,
  );
  const [eligibilityRefreshStatus, setEligibilityRefreshStatus] = useState<EligibilityRefreshStatus>(
    initialGenerationEligibility ? 'success' : 'idle',
  );
  const [eligibilityRetryToken, setEligibilityRetryToken] = useState(0);
  const [analysisStarted, setAnalysisStarted] = useState(
    Boolean(
      restoredAnalysis
      || initialProject?.sourceType === 'SHOPIFY_IMPORT'
      || restoredReadiness?.analysisStarted,
    ),
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
  const [reducedMotion, setReducedMotion] = useState(false);
  const [specText, setSpecText] = useState(
    initialProject
      ? initialProject.sourceType === 'RAW_SPECIFICATIONS'
        ? initialProject.rawInput ?? ''
        : ''
      : demoProductSpecifications,
  );
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
  const [listingDraft, setListingDraft] = useState<ListingDraftInput | null>(restoredDraft);
  const shopifyListingPreview = useMemo(
    () => listingDraft ? assembleShopifyListing(listingDraft) : null,
    [listingDraft],
  );
  const [isAddingGoldFixture, setIsAddingGoldFixture] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<DraftRegenerationSection | null>(null);
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
    eligibilityRequestRef.current?.controller.abort();
  }, []);

  useEffect(() => {
    const persistedDraft = readAuthoritativeListingDraft(initialProject?.generatedListing);
    setListingDraft(persistedDraft);
    if (persistedDraft) {
      setListingContent({
        title: persistedDraft.title.value,
        description: persistedDraft.overview.value,
        keyFeatures: persistedDraft.features.map(({ value }) => value).join('\n'),
        seoTitle: persistedDraft.seo.title.value,
        seoDescription: persistedDraft.seo.description.value,
        tags: persistedDraft.catalog.tags.map(({ value }) => value).join(', '),
      });
    }
  }, [initialProject?.generatedListing, initialProject?.version]);

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

    return false;
  }, [inputMode, productUrl, specText, supplierUrl]);

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
  };

  const startPipeline = (
    product: DemoProduct,
    listing: ReturnType<typeof buildDemoListingContent>,
    context: DemoAnalysisContext,
  ) => {
    setActiveProduct(product);
    setTruthRows(product.truthRows);
    setListingContent((current) => initialProject
      ? listingDraft ? current : emptyListingContent
      : listing);
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

    if (analysisInput.kind === 'uploaded-pdf') {
      setInputError('PDF analysis is not available yet. Use a product URL, supplier URL, or raw specifications.');
      return;
    }

    setInputError(null);
    resetAnalysisResults();

    setIsSubmitting(true);
    const requestController = new AbortController();
    analysisRequestRef.current = requestController;
    const requestTimeout = window.setTimeout(() => requestController.abort(), 85_000);

    try {
      const requestBody = analysisInput.kind === 'raw-specifications'
        ? { source: 'raw-specifications' as const, specifications: specText.trim() }
        : {
            source: analysisInput.kind,
            url: analysisInput.url,
            ...(initialProject?.containerProjectId ? {
              productIdentity: {
                workspaceId: initialProject.workspaceId,
                projectId: initialProject.containerProjectId,
                productId: initialProject.id,
              },
            } : {}),
          };
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: requestController.signal,
      });
      let payload: (ProductAnalysis & { imageDiscoveryWarning?: string }) | { error?: string };
      try {
        const decodedPayload = await response.json() as unknown;
        if (!decodedPayload || typeof decodedPayload !== 'object' || Array.isArray(decodedPayload)) {
          throw new Error('INVALID_RESPONSE');
        }
        payload = decodedPayload as (ProductAnalysis & { imageDiscoveryWarning?: string }) | { error?: string };
      } catch {
        throw new AnalysisRequestError('The analysis service returned an invalid response. Please try again.');
      }

      if (!response.ok || 'error' in payload) {
        throw new AnalysisRequestError('error' in payload && payload.error
          ? payload.error
          : 'Unable to analyze the product input.');
      }

      const analysis = payload as ProductAnalysis & { imageDiscoveryWarning?: string };
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
      if ('imageDiscoveryWarning' in analysis && analysis.imageDiscoveryWarning) {
        setInputError(analysis.imageDiscoveryWarning);
      }
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
            source: activeProduct.sources[0]?.name ?? 'Merchant-reviewed analysis',
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

  const currentProduct = useMemo(
    () => ({ ...activeProduct, truthRows }),
    [activeProduct, truthRows],
  );

  const overview = useMemo(() => {
    const readinessRows = applicableReadinessRows(truthRows);
    const scoredRows = readinessRows.filter((row) => Number.isFinite(row.confidence));
    const score = scoredRows.length
      ? Math.round(scoredRows.reduce((total, row) => total + row.confidence, 0) / scoredRows.length)
      : 0;
    const label = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : 'Needs review';
    const hasUnresolvedFacts = readinessRows.some((row) => row.status !== 'Verified');
    const hasDescription = Boolean(listingDraft?.overview.value.trim() || (!initialProject && listingContent.description.trim()));
    const hasSeo = Boolean(listingDraft
      ? listingDraft.seo.title.value.trim() && listingDraft.seo.description.value.trim()
      : !initialProject && listingContent.seoTitle.trim() && listingContent.seoDescription.trim());
    return {
      score,
      label,
      items: [
        { name: 'Product facts', status: readinessRows.length > 0 && !hasUnresolvedFacts ? 'good' as const : 'warning' as const },
        { name: 'Description', status: hasDescription ? 'good' as const : 'warning' as const },
        { name: 'SEO', status: hasSeo ? 'good' as const : 'warning' as const },
        { name: 'Images', status: listingDraft?.media.length ? 'good' as const : 'warning' as const },
        { name: 'Variants', status: 'warning' as const },
      ],
    };
  }, [initialProject, listingContent, listingDraft, truthRows]);
  const verifiedFactCount = truthRows.filter((row) => row.status === 'Verified').length;
  const hasBlockingFact = truthRows.some((row) => row.status === 'Conflict');
  const exportReady = Boolean(
    verifiedFactCount
    && !hasBlockingFact
    && (listingDraft?.title.value.trim() || (!initialProject && listingContent.title.trim()))
    && (listingDraft?.overview.value.trim() || (!initialProject && listingContent.description.trim())),
  );

  const projectSnapshot = useMemo<ProjectSaveSnapshot>(() => {
    const sourceType = inputMode === 'url'
      ? supplierUrl.trim() ? 'SUPPLIER_URL' as const : null
      : inputMode === 'product'
        ? productUrl.trim() ? 'PRODUCT_URL' as const : null
        : inputMode === 'pdf'
          ? selectedPdf || initialProject?.sourceType === 'UPLOADED_PDF'
            ? 'UPLOADED_PDF' as const
            : null
          : specText.trim() ? 'RAW_SPECIFICATIONS' as const : null;
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

    const persistedDraftFields = listingDraft ? listingDraftProjectFields(listingDraft) : null;
    return {
      sourceType,
      sourceUrl,
      rawInput,
      analysisData: analysisStarted
        ? {
            activeProduct: currentProduct,
            truthRows,
            analysisContext,
            conflictResolved,
          }
        : null,
      generatedListing: persistedDraftFields?.generatedListing ?? null,
      seoData: persistedDraftFields?.seoData ?? null,
      readinessData: {
        analysisStarted,
        activeStage,
        completedStages,
        shopifyReady: exportReady,
      },
    };
  }, [
    currentProduct,
    activeStage,
    analysisContext,
    analysisStarted,
    completedStages,
    conflictResolved,
    initialProject?.rawInput,
    initialProject?.sourceType,
    inputMode,
    listingDraft,
    productUrl,
    selectedPdf,
    exportReady,
    specText,
    supplierUrl,
    truthRows,
  ]);
  const projectSave = useProjectAutosave({
    project: initialProject ?? null,
    snapshot: projectSnapshot,
    enabled: Boolean(initialProject && canManage && initialProject.status !== 'ARCHIVED'),
  });
  const projectId = initialProject?.id;
  const projectWorkspaceId = initialProject?.workspaceId;
  useEffect(() => {
    setGenerationEligibility(initialGenerationEligibility);
    setGenerationEligibilityVersion(initialGenerationEligibilityVersion ?? initialProject?.version ?? null);
    setEligibilityRefreshStatus(initialGenerationEligibility ? 'success' : 'idle');
  }, [initialGenerationEligibility, initialGenerationEligibilityVersion, initialProject?.version]);
  const retryGenerationEligibility = useCallback(() => {
    eligibilityRequestRef.current?.controller.abort();
    eligibilityRequestRef.current = null;
    setEligibilityRefreshStatus('idle');
    setEligibilityRetryToken((token) => token + 1);
  }, []);
  useEffect(() => {
    if (
      !projectId
      || !projectWorkspaceId
      || !analysisStarted
      || listingDraft
      || generationEligibilityVersion === projectSave.currentVersion
    ) return;

    const requestKey = `${productApiBase}:${projectSave.currentVersion}:${eligibilityRetryToken}`;
    if (eligibilityRequestRef.current?.key === requestKey) return;
    eligibilityRequestRef.current?.controller.abort();
    const controller = new AbortController();
    eligibilityRequestRef.current = { key: requestKey, controller };
    setEligibilityRefreshStatus('loading');

    void projectApiRequest<{
      eligibility: CanonicalGenerationEligibility;
      projectVersion: number;
    }>(`${productApiBase}/listing-draft?workspaceId=${encodeURIComponent(projectWorkspaceId)}`, {
      method: 'GET',
      timeoutMs: ELIGIBILITY_TIMEOUT_MS,
      timeoutMessage: 'Could not refresh listing readiness.',
      signal: controller.signal,
    }).then((response) => {
      if (eligibilityRequestRef.current?.controller !== controller) return;
      if (response.projectVersion !== projectSave.currentVersion) {
        setEligibilityRefreshStatus('error');
        return;
      }
      setGenerationEligibility(response.eligibility);
      setGenerationEligibilityVersion(response.projectVersion);
      setEligibilityRefreshStatus('success');
    }).catch(() => {
      if (eligibilityRequestRef.current?.controller !== controller) return;
      setEligibilityRefreshStatus('error');
    }).finally(() => {
      if (eligibilityRequestRef.current?.controller === controller) {
        eligibilityRequestRef.current = null;
      }
    });
  }, [
    analysisStarted,
    eligibilityRetryToken,
    generationEligibilityVersion,
    projectId,
    projectWorkspaceId,
    productApiBase,
    listingDraft,
    projectSave.currentVersion,
  ]);
  const generationEligibilityCurrent = Boolean(
    initialProject
    && generationEligibility
    && generationEligibilityVersion === projectSave.currentVersion,
  );
  const canGenerateListing = Boolean(
    analysisStarted
    && generationEligibilityCurrent
    && generationEligibility?.canGenerate,
  );

  const handleGenerateDraft = async () => {
    if (!initialProject || isReadOnly || generationRequestRef.current) return;
    if (!canGenerateListing) {
      setWorkspaceTab('LISTING');
      return;
    }
    setWorkspaceTab('LISTING');
    generationRequestRef.current = true;
    setDraftError(null);
    setIsGeneratingDraft(true);
    try {
      const authoritativeVersion = await projectSave.saveNow();
      if (authoritativeVersion === null) {
        setDraftError('We could not save the latest project changes. Please try again.');
        return;
      }
      const response = await projectApiRequest<{
        draft: ListingDraftInput;
        readinessData: NonNullable<ProjectSaveSnapshot['readinessData']>;
        project: { version: number; updatedAt: string };
      }>(
        `${productApiBase}/listing-draft`,
        {
          method: 'POST',
          body: { workspaceId: initialProject.workspaceId, version: authoritativeVersion },
          timeoutMs: GENERATION_TIMEOUT_MS,
          timeoutMessage: "We couldn't generate this listing in time. Please try again.",
        },
      );
      const projectFields = listingDraftProjectFields(response.draft);
      const nextContent = {
        title: response.draft.title.value,
        description: response.draft.overview.value,
        keyFeatures: response.draft.features.map(({ value }) => value).join('\n'),
        seoTitle: response.draft.seo.title.value,
        seoDescription: response.draft.seo.description.value,
        tags: response.draft.catalog.tags.map(({ value }) => value).join(', '),
      };
      const savedSnapshot: ProjectSaveSnapshot = {
        ...projectSnapshot,
        ...projectFields,
        readinessData: response.readinessData,
      };
      setListingContent(nextContent);
      setListingDraft(response.draft);
      setActiveStage(response.readinessData.activeStage);
      setCompletedStages(response.readinessData.completedStages);
      projectSave.adoptExternalSave(response.project.version, savedSnapshot);
    } catch (error) {
      if (error instanceof ProjectApiError && error.code === 'DRAFT_GENERATION_BLOCKED') {
        const details = error.details as { eligibility?: CanonicalGenerationEligibility } | undefined;
        if (details?.eligibility) {
          setGenerationEligibility(details.eligibility);
          setGenerationEligibilityVersion(projectSave.currentVersion);
        }
      }
      const requestReference = error instanceof ProjectApiError && error.requestId
        ? ` Reference: ${error.requestId}.`
        : '';
      setDraftError(error instanceof ProjectApiError
        ? `${error.message}${requestReference}`
        : 'The listing draft could not be displayed after generation. Refresh the page and try again.');
      if (error instanceof ProjectApiError && error.status === 409) router.refresh();
    } finally {
      generationRequestRef.current = false;
      setIsGeneratingDraft(false);
    }
  };

  const handleSaveDraft = async (): Promise<boolean> => {
    if (!initialProject || !listingDraft || isReadOnly) return false;
    setDraftError(null);
    setIsSavingDraft(true);
    try {
      const response = await projectApiRequest<{
        draft: ListingDraftInput;
        project: { version: number; updatedAt: string };
      }>(`${productApiBase}/listing-draft`, {
        method: 'PATCH',
        body: {
          workspaceId: initialProject.workspaceId,
          version: projectSave.currentVersion,
          draft: listingDraft,
        },
        timeoutMs: 60_000,
      });
      const nextContent = {
        ...listingContent,
        title: response.draft.title.value,
        description: response.draft.overview.value,
        keyFeatures: response.draft.features.map(({ value }) => value).join('\n'),
        seoTitle: response.draft.seo.title.value,
        seoDescription: response.draft.seo.description.value,
        tags: response.draft.catalog.tags.map(({ value }) => value).join(', '),
      };
      const savedSnapshot: ProjectSaveSnapshot = {
        ...projectSnapshot,
        generatedListing: {
          title: nextContent.title,
          description: nextContent.description,
          keyFeatures: nextContent.keyFeatures,
          listingDraft: response.draft,
        },
        seoData: {
          seoTitle: nextContent.seoTitle,
          seoDescription: nextContent.seoDescription,
          tags: nextContent.tags,
        },
      };
      setListingContent(nextContent);
      setListingDraft(response.draft);
      projectSave.adoptExternalSave(response.project.version, savedSnapshot);
      return true;
    } catch (error) {
      setDraftError(error instanceof ProjectApiError ? error.message : 'The listing draft could not be saved.');
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleAddToGoldLibrary = async () => {
    if (!initialProject || !listingDraft || listingDraft.status !== 'SAVED' || !canManage) return;
    setDraftError(null);
    setIsAddingGoldFixture(true);
    try {
      const response = await projectApiRequest<{ fixture: { fixtureId: string } }>('/api/listing-calibration/fixtures', {
        method: 'POST',
        body: {
          workspaceId: initialProject.workspaceId,
          projectId: initialProject.id,
          name: listingDraft.title.value.trim(),
          category: listingDraft.catalog.productType.value.trim() || 'Uncategorized',
        },
      });
      router.push(`/settings/business-profile/listing/calibration?fixtureId=${encodeURIComponent(response.fixture.fixtureId)}`);
    } catch (error) {
      setDraftError(error instanceof ProjectApiError ? error.message : 'The Gold Fixture could not be created.');
    } finally {
      setIsAddingGoldFixture(false);
    }
  };

  const handleRegenerateDraft = async (section: DraftRegenerationSection) => {
    if (!initialProject || !listingDraft || isReadOnly) return;
    if (projectSave.status !== 'saved') {
      setDraftError('Wait for autosave to finish before regenerating this section.');
      return;
    }
    setDraftError(null);
    setRegeneratingSection(section);
    try {
      const response = await projectApiRequest<{
        draft: ListingDraftInput;
        project: { version: number; updatedAt: string };
      }>(`${productApiBase}/listing-draft`, {
        method: 'PUT',
        body: {
          workspaceId: initialProject.workspaceId,
          version: projectSave.currentVersion,
          section,
        },
        timeoutMs: 90_000,
      });
      const nextContent = {
        ...listingContent,
        title: response.draft.title.value,
        description: response.draft.overview.value,
        keyFeatures: response.draft.features.map(({ value }) => value).join('\n'),
        seoTitle: response.draft.seo.title.value,
        seoDescription: response.draft.seo.description.value,
        tags: response.draft.catalog.tags.map(({ value }) => value).join(', '),
      };
      const savedSnapshot: ProjectSaveSnapshot = {
        ...projectSnapshot,
        generatedListing: {
          title: nextContent.title,
          description: nextContent.description,
          keyFeatures: nextContent.keyFeatures,
          listingDraft: response.draft,
        },
        seoData: {
          seoTitle: nextContent.seoTitle,
          seoDescription: nextContent.seoDescription,
          tags: nextContent.tags,
        },
      };
      setListingContent(nextContent);
      setListingDraft(response.draft);
      projectSave.adoptExternalSave(response.project.version, savedSnapshot);
    } catch (error) {
      setDraftError(error instanceof ProjectApiError ? error.message : 'This section could not be regenerated.');
    } finally {
      setRegeneratingSection(null);
    }
  };

  const listingStyleChanged = Boolean(
    listingDraft?.metadata.listingProfileFingerprint
    && listingStyle?.fingerprint
    && listingDraft.metadata.listingProfileFingerprint !== listingStyle.fingerprint,
  );
  const showProjectEntry = shouldShowProjectEntry(initialProject, analysisStarted);
  const publishingReviewComplete = ['TITLE', 'OVERVIEW', 'SPECIFICATIONS', 'FEATURES', 'SEO', 'CATALOG'].every((section) => listingDraft?.reviewWorkspace?.reviewedSections.includes(section as never));
  const workflowProgress: Partial<Record<WorkspaceTab, boolean>> = {
    OVERVIEW: analysisStarted,
    LISTING: listingDraft?.status === 'SAVED' && publishingReviewComplete,
    IMAGES: Boolean(shopifyImages?.configuration.images.length),
    METAFIELDS: Boolean(shopifyMetafields?.configuration.version),
    SHOPIFY: Boolean(shopifyPublishing?.publication),
  };
  const primaryAction = !analysisStarted
    ? { label: 'Analyze Product', tab: 'ADVANCED' as const }
    : !listingDraft
      ? generationEligibilityCurrent && !generationEligibility?.canGenerate
        ? { label: 'Review blockers', tab: 'LISTING' as const }
        : { label: 'Generate Listing', tab: 'LISTING' as const }
      : listingDraft.status !== 'SAVED' || !publishingReviewComplete
        ? { label: 'Review Listing', tab: 'LISTING' as const }
        : { label: 'Prepare for Shopify', tab: 'SHOPIFY' as const };
  const selectWorkspaceTab = (tab: WorkspaceTab) => setWorkspaceTab(tab);
  const onWorkspaceTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: WorkspaceTab) => {
    const index = workspaceTabs.findIndex(({ id }) => id === tab);
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = workspaceTabs[(index + direction + workspaceTabs.length) % workspaceTabs.length]!;
    setWorkspaceTab(next.id);
    document.getElementById(`workspace-tab-${next.id.toLocaleLowerCase('en-US')}`)?.focus();
  };

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
              {initialProject?.containerProjectId ? (
                <Link href={`/workspace/${initialProject.containerProjectId}?${new URLSearchParams({ organizationId: initialProject.organizationId, workspaceId: initialProject.workspaceId })}`} className="rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white">
                  Products
                </Link>
              ) : null}
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

          {showProjectEntry ? (
            <div className="mx-auto mt-6 w-full max-w-3xl min-w-0">
              <ProductInput
                entryMode
                inputMode={inputMode}
                onModeChange={handleModeChange}
                onAnalyze={handleAnalyze}
                analysisStarted={analysisStarted}
                isRunning={isRunning || isSubmitting}
                canAnalyze={canAnalyze}
                specText={specText}
                onSpecTextChange={(value) => {
                  setSpecText(value);
                  setInputError(null);
                }}
                supplierUrl={supplierUrl}
                productUrl={productUrl}
                onUrlChange={handleUrlChange}
                selectedPdf={selectedPdf}
                onPdfChange={handlePdfChange}
                inputError={inputError}
                readOnly={isReadOnly}
              />
            </div>
          ) : (
          <>
          <nav role="tablist" aria-label="Product workspace" className="mt-6 flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-1">
            {workspaceTabs.map(({ id, label }) => (
              <button key={id} id={`workspace-tab-${id.toLocaleLowerCase('en-US')}`} type="button" role="tab" aria-selected={workspaceTab === id} aria-controls={`workspace-panel-${id.toLocaleLowerCase('en-US')}`} tabIndex={workspaceTab === id ? 0 : -1} onClick={() => selectWorkspaceTab(id)} onKeyDown={(event) => onWorkspaceTabKeyDown(event, id)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${workspaceTab === id ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
                {workflowProgress[id] ? `✓ ${label}` : label}
              </button>
            ))}
          </nav>

          {workspaceTab === 'OVERVIEW' ? (
            <section id="workspace-panel-overview" role="tabpanel" aria-labelledby="workspace-tab-overview" className="mt-6 max-w-4xl min-w-0">
              <div className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5 sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Product Overview</p>
                <h1 className="mt-2 break-words text-2xl font-semibold text-white sm:text-3xl">{activeProduct.brand} {activeProduct.model}</h1>
                <dl className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    ['Analysis', analysisStarted ? 'Complete' : 'Not started'],
                    ['Listing', listingDraft ? 'Generated' : 'Not generated'],
                    ['Readiness', listingDraft ? 'Ready for review' : !analysisStarted ? 'Needs analysis' : !generationEligibilityCurrent ? 'Checking' : generationEligibility?.canGenerate ? generationEligibility.warnings.length ? 'Ready with warnings' : 'Ready to generate' : 'Needs attention'],
                  ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-medium text-white">{value}</dd></div>)}
                </dl>
                {analysisStarted && !listingDraft ? <div className="mt-5"><GenerationEligibilityPanel eligibility={generationEligibility} current={generationEligibilityCurrent} refreshStatus={eligibilityRefreshStatus} onRetry={retryGenerationEligibility} onReviewProductTruth={() => selectWorkspaceTab('ADVANCED')} /></div> : null}
                <div className="mt-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Next step</p><button type="button" onClick={() => { if (primaryAction.label === 'Generate Listing') void handleGenerateDraft(); else if (primaryAction.label === 'Analyze Product' && canAnalyze) void handleAnalyze(); else selectWorkspaceTab(primaryAction.tab); }} disabled={isReadOnly || isGeneratingDraft || isSubmitting} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-200 disabled:opacity-50 sm:w-auto"><Sparkles className="h-4 w-4" aria-hidden="true" />{isGeneratingDraft ? 'Generating…' : primaryAction.label}</button></div>
              </div>
            </section>
          ) : null}

          {workspaceTab === 'LISTING' ? (
            <section id="workspace-panel-listing" role="tabpanel" aria-labelledby="workspace-tab-listing" className="mt-6 min-w-0 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#081423] px-4 py-3"><div><p className="text-xs uppercase tracking-[0.18em] text-slate-500">{listingDraft ? 'Generated with' : 'Listing Style'}</p><p className="mt-1 font-semibold text-white">{listingDraft?.metadata.listingStandardId ? `${listingDraft.metadata.listingStandardId} Standard` : listingStyle?.standardName ?? 'Not configured'}</p><p className="mt-1 text-xs text-slate-400">{listingDraft ? 'Using your saved Listing Style at generation time' : 'Current saved Listing Style will be used.'}</p></div><Link href="/settings/business-profile/listing" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-white/5">View Listing Style</Link></div>
              {listingStyleChanged ? <div role="alert" className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-4"><p className="font-semibold text-amber-100">Your Listing Style changed after this draft was generated.</p><p className="mt-1 text-sm text-slate-300">The existing draft is unchanged. Generate a new draft to apply the latest preferences.</p><button type="button" onClick={handleGenerateDraft} disabled={isGeneratingDraft || isReadOnly} className="mt-3 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">Generate New Draft</button></div> : null}
              {initialProject && !listingDraft ? <><GenerationEligibilityPanel eligibility={generationEligibility} current={generationEligibilityCurrent} refreshStatus={eligibilityRefreshStatus} onRetry={retryGenerationEligibility} onReviewProductTruth={() => selectWorkspaceTab('ADVANCED')} /><section className="rounded-2xl border border-white/10 bg-[#081423] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">Listing Draft</h2><p className="mt-1 text-sm text-slate-400">{isGeneratingDraft ? 'Generating content…' : 'No listing generated yet.'}</p>{isGeneratingDraft ? <div role="status" aria-live="polite" className="mt-3 space-y-2 text-sm"><p className="text-emerald-200">✓ Preparing verified Product information</p><p className="text-emerald-200">✓ Applying {listingStyle?.standardName ?? 'your Listing Standard'}</p><p className="font-medium text-amber-100">Generating content…</p><p className="text-slate-400">Fact checks, quality checks, and saving will follow before the listing appears.</p></div> : null}</div><button type="button" onClick={handleGenerateDraft} disabled={isReadOnly || isGeneratingDraft || !canGenerateListing} className="rounded-xl bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{isGeneratingDraft ? 'Generating…' : 'Generate Listing'}</button></div>{draftError ? <div role="alert" className="mt-4 rounded-xl bg-rose-400/10 p-4 text-sm text-rose-100"><p>{draftError}</p><button type="button" onClick={handleGenerateDraft} disabled={isGeneratingDraft || !canGenerateListing} className="mt-3 rounded-lg border border-rose-200/20 px-3 py-2 text-xs font-semibold hover:bg-rose-200/10 disabled:opacity-50">Retry</button></div> : null}</section></> : null}
              {listingDraft ? <><div role="status" className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-100">&#10003; Listing generated and quality checked</div><ListingDraftReview view="LISTING" draft={listingDraft} onChange={setListingDraft} onSave={handleSaveDraft} onRegenerate={handleRegenerateDraft} saving={isSavingDraft} regenerating={regeneratingSection} autosaveStatus={projectSave.message} readOnly={isReadOnly} error={draftError} onAddToGoldLibrary={canManage ? handleAddToGoldLibrary : undefined} addingToGoldLibrary={isAddingGoldFixture} onContinue={() => selectWorkspaceTab('IMAGES')} pricingAndVariants={initialProject && shopifyVariants ? <ShopifyVariantsPanel key={`variants-${shopifyPanelGeneration}`} projectId={initialProject.id} configured={shopifyVariants.configured} connected={shopifyVariants.connected} canManage={shopifyVariants.canManage} hasPublishedProduct={hasPublishedShopifyProduct} initialConfiguration={shopifyVariants.configuration} /> : undefined} /></> : null}
            </section>
          ) : null}

          {workspaceTab === 'IMAGES' && initialProject && shopifyImages && initialProject.containerProjectId ? <div id="workspace-panel-images" role="tabpanel" aria-labelledby="workspace-tab-images" className="mt-6"><ShopifyImagesPanel key={`images-${shopifyPanelGeneration}`} projectId={initialProject.id} containerProjectId={initialProject.containerProjectId} workspaceId={initialProject.workspaceId} configured={shopifyImages.configured} connected={shopifyImages.connected} canManage={shopifyImages.canManage} hasPublishedProduct={hasPublishedShopifyProduct} initialConfiguration={shopifyImages.configuration} onNext={() => selectWorkspaceTab('METAFIELDS')} /></div> : null}

          {workspaceTab === 'METAFIELDS' && initialProject && shopifyMetafields ? <div id="workspace-panel-metafields" role="tabpanel" aria-labelledby="workspace-tab-metafields" className="mt-6"><ShopifyMetafieldsPanel key={`metafields-${shopifyPanelGeneration}`} projectId={initialProject.id} configured={shopifyMetafields.configured} connected={shopifyMetafields.connected} canManage={shopifyMetafields.canManage} hasPublishedProduct={hasPublishedShopifyProduct} initialConfiguration={shopifyMetafields.configuration} onNext={() => selectWorkspaceTab('SHOPIFY')} /></div> : null}

        {workspaceTab === 'SHOPIFY' ? <div id="workspace-panel-shopify" role="tabpanel" aria-labelledby="workspace-tab-shopify" className="mt-6 space-y-6">{shopifyListingPreview ? <ShopifyListingPreview listing={shopifyListingPreview} notice={listingDraft?.status === 'SAVED' ? 'This saved listing is the version that will be reviewed before publishing.' : 'Save the listing before continuing to Shopify.'} /> : <section className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5 sm:p-7"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Shopify Preview</p><h2 className="mt-2 text-2xl font-semibold text-white">Generate a listing to preview the final product</h2><p className="mt-2 text-sm leading-6 text-slate-400">Your title, description, organization, SEO, images, and optional metafields will appear here.</p></section>}<section className="rounded-[1.75rem] border border-amber-300/20 bg-[#081423] p-5 sm:p-7"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Ready for Shopify</p><h2 className="mt-2 text-2xl font-semibold text-white">Review the complete product before publishing</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">ListingPilot will show every proposed Shopify change for confirmation. Nothing is published from this page.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
          ['Content', listingDraft?.status === 'SAVED' && publishingReviewComplete ? 'Saved and approved' : 'Needs review'],
          ['Images', shopifyImages?.configuration.images.length ? `${shopifyImages.configuration.images.length} selected` : 'Optional'],
          ['Organization', listingDraft?.reviewWorkspace?.reviewedSections.includes('CATALOG') ? 'Reviewed' : 'Needs review'],
          ['Pricing & Variants', shopifyVariants?.configuration.variants.length ? `${shopifyVariants.configuration.variants.length} configured` : 'Optional'],
          ['SEO', listingDraft?.reviewWorkspace?.reviewedSections.includes('SEO') ? 'Reviewed' : 'Needs review'],
          ['Metafields', shopifyMetafields?.configuration.fields.some(({ enabled }) => enabled) ? 'Selected' : 'Optional'],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm"><span className="text-slate-500">{label}</span><p className="mt-1 font-medium text-white">{value}</p></div>)}</div><div className="mt-5 flex flex-wrap gap-3 text-sm"><span className="rounded-full border border-white/10 px-3 py-2 text-slate-300">Store: {shopifyPublishing?.connected ? 'Connected' : 'Not connected'}</span><span className="rounded-full border border-white/10 px-3 py-2 text-slate-300">Destination chosen during review</span></div>{productWorkspaceBase ? <Link href={`${productWorkspaceBase}/shopify-publish`} className="mt-6 inline-flex rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-200">Review &amp; Publish to Shopify →</Link> : null}</section></div> : null}

          {workspaceTab === 'ADVANCED' ? <section id="workspace-panel-advanced" role="tabpanel" aria-labelledby="workspace-tab-advanced" className="mt-6"><details className="rounded-2xl border border-white/10 bg-[#081423]"><summary className="cursor-pointer px-5 py-4 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">Open technical and legacy tools</summary><div className="border-t border-white/10 p-4"><div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
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
                  setInputError(null);
                }}
                supplierUrl={supplierUrl}
                productUrl={productUrl}
                onUrlChange={handleUrlChange}
                selectedPdf={selectedPdf}
                onPdfChange={handlePdfChange}
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
                    product={currentProduct}
                    hasConflict={hasConflict}
                    conflictResolved={conflictResolved}
                    onResolve={handleResolveConflict}
                    visibleSourcesCount={showSources}
                    recommendationConfidence={recommendationConfidence}
                    showRecommendation={showRecommendation}
                    readOnly={isReadOnly}
                  />
                  <CatalogHealth product={{ ...currentProduct, catalogHealth: { ...currentProduct.catalogHealth, score: overview.score, label: overview.label, items: overview.items } }} />
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-6">
              <section className="relative overflow-hidden rounded-[1.75rem] border border-amber-400/20 bg-[#081423] p-5">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,199,76,0.16),transparent_45%)]" />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">SHOPIFY CSV EXPORT</div>
                    <div className="mt-2 text-sm text-slate-400">Export readiness is based on the current listing and unresolved Product Truth conflicts.</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${exportReady ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-white/10 bg-white/5 text-slate-400'}`}>
                    {exportReady ? 'Ready' : 'Needs review'}
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
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">{overview.score}% Product Truth confidence</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">{verifiedFactCount} verified facts</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">{overview.items.find((item) => item.name === 'SEO')?.status === 'good' ? 'SEO fields present' : 'SEO not provided'}</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">Variants not assessed</div>
                  </div>
                </div>

                <div className="relative mt-5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleExport}
                    disabled={!exportReady}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${exportReady ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'}`}
                  >
                    <Download className="h-4 w-4" />
                    EXPORT SHOPIFY CSV
                  </button>
                  <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300">
                    {exportReady ? 'Ready to export current fields' : 'Resolve conflicts and complete the listing'}
                  </div>
                </div>
              </section>

              {!initialProject ? <GeneratedListing
                content={listingContent}
                onChange={(field, value) => setListingContent((prev) => ({ ...prev, [field]: value }))}
                readOnly={isReadOnly}
              /> : null}
              {initialProject ? (
                <section className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Generate Listing</h2>
                      <p className="mt-1 text-sm text-slate-400">Create a complete structured draft from the approved generation instructions.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateDraft}
                      disabled={isReadOnly || isGeneratingDraft || !canGenerateListing}
                      className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      {isGeneratingDraft ? 'Generating…' : 'Generate Listing'}
                    </button>
                  </div>
                  {draftError && !listingDraft ? (
                    <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm">
                      <p className="font-semibold text-rose-100">Generation needs attention</p>
                      <p className="mt-1 text-rose-200">{draftError}</p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-rose-200">Required action</p>
                      <p className="mt-1 text-slate-300">Resolve the highlighted project or merchant-profile item, then retry.</p>
                      <button type="button" onClick={handleGenerateDraft} disabled={isGeneratingDraft || !canGenerateListing} className="mt-3 inline-flex items-center gap-2 rounded-full border border-rose-300/20 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-300/10 disabled:opacity-50">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Retry generation
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {listingDraft ? (
                <>
                  <ListingDraftReview
                    view="ADVANCED"
                    draft={listingDraft}
                    onChange={setListingDraft}
                    onSave={handleSaveDraft}
                    onRegenerate={handleRegenerateDraft}
                    saving={isSavingDraft}
                    regenerating={regeneratingSection}
                    autosaveStatus={projectSave.message}
                    readOnly={isReadOnly}
                    error={draftError}
                    onOpenListing={() => selectWorkspaceTab('LISTING')}
                    onAddToGoldLibrary={canManage ? handleAddToGoldLibrary : undefined}
                    addingToGoldLibrary={isAddingGoldFixture}
                  />
                  {productWorkspaceBase ? <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Next step</p><h2 className="mt-2 text-xl font-semibold text-white">Prepare for Shopify</h2><p className="mt-2 text-sm leading-6 text-slate-400">Review fresh Shopify values beside the saved ListingPilot proposal before choosing any changes.</p><Link href={`${productWorkspaceBase}/shopify-publish`} className="mt-4 inline-flex rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950">Prepare for Shopify</Link></section> : null}
                </>
              ) : null}
              {initialProject && shopifyCoordinator ? (
                <ShopifyPublicationCoordinatorPanel
                  projectId={initialProject.id}
                  configured={shopifyCoordinator.configured}
                  connected={shopifyCoordinator.connected}
                  canManage={shopifyCoordinator.canManage}
                  initialCoordinator={shopifyCoordinator.coordinator}
                  onCompleted={(result) => {
                    const product = result.steps.find(({ step }) => step === 'PRODUCT');
                    if (product && ['SUCCEEDED', 'UNCHANGED'].includes(product.status)) {
                      setHasPublishedShopifyProduct(true);
                    }
                    setShopifyPanelGeneration((current) => current + 1);
                    router.refresh();
                  }}
                />
              ) : null}
              {initialProject && shopifyPublishing ? (
                <ShopifyPublishingPanel
                  key={`product-${shopifyPanelGeneration}`}
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
              <ProductTruthTable rows={truthRows} visibleCount={visibleRows} />
              <RecentAnalyses product={currentProduct} />
            </div>
          </div></div></details></section> : null}
          </>
          )}
        </div>
      </div>
    </main>
  );
}
