import type { ProductAnalysis } from '../../../lib/analysis-schema.ts';
import type { ProjectAnalysisData, ProjectGeneratedListing, ProjectReadinessData, ProjectSeoData, ProjectSourceType } from '../../projects/validators/project.ts';

export interface ProductSourceState {
  readonly sourceType: ProjectSourceType | null;
  readonly sourceUrl: string | null;
  readonly rawInput: string | null;
}

export function sourceHasChanged(left: ProductSourceState, right: ProductSourceState): boolean {
  return left.sourceType !== right.sourceType
    || (left.sourceUrl?.trim() || null) !== (right.sourceUrl?.trim() || null)
    || (left.rawInput?.trim() || null) !== (right.rawInput?.trim() || null);
}

export function productEvidenceIsCurrent(readiness: unknown): boolean {
  if (!readiness || typeof readiness !== 'object') return true;
  const flags = readiness as { analysisPending?: unknown; listingEvidenceStale?: unknown };
  return flags.analysisPending !== true && flags.listingEvidenceStale !== true;
}

interface ProductWork extends ProductSourceState {
  readonly analysisData: ProjectAnalysisData | null;
  readonly generatedListing: ProjectGeneratedListing | null;
  readonly seoData: ProjectSeoData | null;
  readonly readinessData: ProjectReadinessData | null;
}

// Source edits stage replacement input while retaining the last successful work.
// These flags are derived by the server and cannot be cleared by ordinary autosave.
export function preserveProductWork(
  existing: ProductWork,
  next: ProductWork,
  options: { readonly refreshListingEvidence?: boolean } = {},
): ProductWork {
  const analysisPending = Boolean(existing.readinessData?.analysisPending || next.readinessData?.analysisPending
    || ((existing.analysisData || existing.generatedListing) && sourceHasChanged(existing, next)));
  const listingEvidenceStale = Boolean(existing.readinessData?.listingEvidenceStale
    && !(options.refreshListingEvidence && !analysisPending));
  return {
    ...next,
    analysisData: analysisPending ? existing.analysisData : next.analysisData ?? existing.analysisData,
    generatedListing: analysisPending ? existing.generatedListing : next.generatedListing ?? existing.generatedListing,
    seoData: analysisPending ? existing.seoData : next.seoData ?? existing.seoData,
    readinessData: {
      ...(next.readinessData ?? existing.readinessData ?? {
        analysisStarted: false, activeStage: 'input', completedStages: [], shopifyReady: false,
      }),
      analysisPending,
      listingEvidenceStale,
      ...(analysisPending || listingEvidenceStale ? { shopifyReady: false } : {}),
    },
  };
}

export function buildProductAnalysisData(analysis: ProductAnalysis, source: ProductSourceState): ProjectAnalysisData {
  const pasted = source.sourceType === 'RAW_SPECIFICATIONS';
  const supplier = source.sourceType === 'SUPPLIER_URL';
  const sourceName = pasted ? 'Pasted specifications' : source.sourceUrl ?? 'Product information';
  const sourceType = pasted ? 'User input' : supplier ? 'Supplier URL' : 'Product URL';
  const score = analysis.overallConfidence;
  const conflict = analysis.conflict;
  return {
    activeProduct: {
      ...analysis.product,
      truthRows: analysis.truthRows,
      sources: [{ name: sourceName, type: sourceType, confidence: score, status: 'Review' }],
      conflict: {
        label: conflict?.field ?? '', official: conflict?.values[0] ?? '', amazon: conflict?.values[1] ?? '',
        lg: conflict?.recommendedValue ?? '', recommendation: conflict ? `Use ${conflict.recommendedValue}` : '',
        recommendedValue: conflict?.recommendedValue ?? '', explanation: conflict?.explanation ?? `No conflicting values were found in the ${sourceType.toLowerCase()}.`,
      },
      catalogHealth: {
        score, label: score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : 'Needs review',
        items: [
          { name: 'Product facts', status: analysis.missingFields.length || conflict ? 'warning' : 'good' },
          { name: 'Description', status: analysis.listing.description ? 'good' : 'warning' },
          { name: 'SEO', status: analysis.listing.seoTitle && analysis.listing.seoDescription ? 'good' : 'warning' },
          { name: 'Images', status: 'warning' }, { name: 'Variants', status: 'warning' },
        ],
      },
      analyses: [{
        title: [analysis.product.brand, analysis.product.model].filter((value) => value && value !== 'Missing').join(' ') || 'Analyzed product',
        status: analysis.missingFields.length ? 'Review' : 'Completed', score,
      }],
    },
    truthRows: analysis.truthRows,
    analysisContext: {
      sourceLabel: pasted ? 'Raw specifications' : supplier ? 'Supplier URL' : 'Product URL',
      notice: pasted ? 'OpenAI analysis generated from the supplied raw specifications' : `OpenAI analysis generated from the extracted ${sourceType.toLowerCase()}`,
    },
    conflictResolved: false,
  };
}
