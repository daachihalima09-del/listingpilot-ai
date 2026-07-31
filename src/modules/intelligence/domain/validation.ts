import { IntelligenceDomainError } from './errors.ts';
import { immutableCopy } from './immutability.ts';
import type {
  ConfidenceResult,
  Evidence,
  IntelligenceContext,
  IntelligenceIssue,
  IntelligenceRecommendation,
  NormalizedProduct,
} from './types.ts';

const moneyPattern = /^-?\d+(?:\.\d+)?$/;

function requireIdentity(value: string, field: string): void {
  if (!value.trim() || value.length > 255) {
    throw new IntelligenceDomainError('INVALID_IDENTITY', `${field} must be a stable non-empty identity.`, { field });
  }
}

export function validateTimestamp(value: string, field: string): void {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new IntelligenceDomainError('INVALID_TIMESTAMP', `${field} must be a valid timestamp.`, { field });
  }
}

export function validateMoney(value: string | undefined, field: string): void {
  if (value !== undefined && (!moneyPattern.test(value) || value.length > 64)) {
    throw new IntelligenceDomainError('INVALID_MONEY', `${field} must be an exact decimal string.`, { field });
  }
}

export function validateConfidence(result: ConfidenceResult): void {
  if (!Number.isFinite(result.value) || result.value < 0 || result.value > 1) {
    throw new IntelligenceDomainError('INVALID_CONFIDENCE', 'Confidence must be between zero and one.');
  }
  for (const factor of result.factors) {
    if (!Number.isFinite(factor.contribution) || factor.contribution < -1 || factor.contribution > 1) {
      throw new IntelligenceDomainError('INVALID_CONFIDENCE', 'Confidence factor contribution must be between minus one and one.');
    }
  }
}

export function validateEvidence(evidence: Evidence): void {
  requireIdentity(evidence.id, 'evidence.id');
  requireIdentity(evidence.providerId, 'evidence.providerId');
  if (!evidence.claim.trim()) {
    throw new IntelligenceDomainError('INVALID_EVIDENCE', 'Evidence must describe a claim.');
  }
  if (!Number.isFinite(evidence.freshness) || evidence.freshness < 0 || evidence.freshness > 1) {
    throw new IntelligenceDomainError('INVALID_EVIDENCE', 'Evidence freshness must be between zero and one.');
  }
  if (!Number.isFinite(evidence.priority) || evidence.priority < 0) {
    throw new IntelligenceDomainError('INVALID_EVIDENCE', 'Evidence priority must be non-negative.');
  }
  validateTimestamp(evidence.retrievedAt, 'evidence.retrievedAt');
  if (evidence.sourceReference) {
    validateTimestamp(evidence.sourceReference.retrievedAt, 'evidence.sourceReference.retrievedAt');
  }
}

export function validateNormalizedProduct(product: NormalizedProduct): void {
  requireIdentity(product.id, 'product.id');
  validateTimestamp(product.createdAt, 'product.createdAt');
  validateTimestamp(product.updatedAt, 'product.updatedAt');
  if (product.publishedAt) validateTimestamp(product.publishedAt, 'product.publishedAt');
  for (const reference of product.sourceReferences) validateTimestamp(reference.retrievedAt, 'sourceReference.retrievedAt');
  for (const variant of product.variants) {
    requireIdentity(variant.id, 'variant.id');
    for (const reference of variant.sourceReferences) validateTimestamp(reference.retrievedAt, 'variant.sourceReference.retrievedAt');
  }
  for (const specification of product.specifications) {
    if (specification.confidence) validateConfidence(specification.confidence);
  }
  for (const media of product.media) {
    requireIdentity(media.id, 'media.id');
  }
}

export function createNormalizedProduct(product: NormalizedProduct): NormalizedProduct {
  validateNormalizedProduct(product);
  return immutableCopy(product) as NormalizedProduct;
}

export function validateIssue(issue: IntelligenceIssue): void {
  requireIdentity(issue.id, 'issue.id');
  requireIdentity(issue.detectorId, 'issue.detectorId');
  requireIdentity(issue.detectorVersion, 'issue.detectorVersion');
  requireIdentity(issue.code, 'issue.code');
  if (!issue.title.trim() || !issue.explanation.trim()) {
    throw new IntelligenceDomainError('INVALID_ISSUE', 'An issue requires a title and explanation.');
  }
  if (issue.scope === 'FIELD' && issue.affectedFields.length === 0) {
    throw new IntelligenceDomainError('INVALID_ISSUE', 'A field-scoped issue requires affected fields.');
  }
  if (issue.scope !== 'CATALOG' && issue.affectedProductIds.length === 0) {
    throw new IntelligenceDomainError('INVALID_ISSUE', 'A non-catalog issue requires an affected product.');
  }
  if (issue.confidence) validateConfidence(issue.confidence);
  validateTimestamp(issue.createdAt, 'issue.createdAt');
}

export function createIntelligenceIssue(issue: IntelligenceIssue): IntelligenceIssue {
  validateIssue(issue);
  return immutableCopy(issue) as IntelligenceIssue;
}

export function validateRecommendation(
  recommendation: IntelligenceRecommendation,
  validIssueIds?: ReadonlySet<string>,
): void {
  requireIdentity(recommendation.id, 'recommendation.id');
  requireIdentity(recommendation.strategyId, 'recommendation.strategyId');
  if (!recommendation.title.trim() || !recommendation.explanation.trim()) {
    throw new IntelligenceDomainError('INVALID_RECOMMENDATION', 'A recommendation requires a title and explanation.');
  }
  if (recommendation.issueIds.length === 0) {
    throw new IntelligenceDomainError('INVALID_RECOMMENDATION', 'A recommendation requires at least one issue reference.');
  }
  if (validIssueIds && recommendation.issueIds.some((id) => !validIssueIds.has(id))) {
    throw new IntelligenceDomainError('INVALID_RECOMMENDATION', 'A recommendation references an unknown issue.');
  }
  if (recommendation.proposedValues.some(({ field }) => !field.trim())) {
    throw new IntelligenceDomainError('INVALID_RECOMMENDATION', 'A proposed value requires a field.');
  }
  if (recommendation.confidence) validateConfidence(recommendation.confidence);
}

export function createIntelligenceRecommendation(
  recommendation: IntelligenceRecommendation,
  validIssueIds?: ReadonlySet<string>,
): IntelligenceRecommendation {
  validateRecommendation(recommendation, validIssueIds);
  return immutableCopy(recommendation) as IntelligenceRecommendation;
}

export function validateIntelligenceContext(context: IntelligenceContext): void {
  requireIdentity(context.workspaceId, 'context.workspaceId');
  requireIdentity(context.catalogId, 'context.catalogId');
  requireIdentity(context.execution.executionId, 'context.execution.executionId');
  requireIdentity(context.execution.engineVersion, 'context.execution.engineVersion');
  validateTimestamp(context.execution.requestedAt, 'context.execution.requestedAt');
  const productIds = new Set<string>();
  for (const product of context.products) {
    validateNormalizedProduct(product);
    if (productIds.has(product.id)) {
      throw new IntelligenceDomainError('DUPLICATE_PRODUCT_ID', 'The analysis context contains duplicate product IDs.', {
        productId: product.id,
      });
    }
    productIds.add(product.id);
  }
  if (context.analysisScope === 'SINGLE_PRODUCT' && context.products.length !== 1) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Single-product analysis requires exactly one product.');
  }
  if (context.analysisScope === 'SELECTED_PRODUCTS' && context.products.length === 0) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Selected-products analysis requires at least one product.');
  }
  if (
    context.options.detectorTimeoutMs <= 0
    || context.options.globalTimeoutMs <= 0
    || context.options.globalTimeoutMs < context.options.detectorTimeoutMs
  ) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Analysis timeout configuration is invalid.');
  }
  const thresholds = context.confidenceThresholds;
  if (
    thresholds.veryLowMaximum < 0
    || thresholds.highMaximum > 1
    || !(
      thresholds.veryLowMaximum < thresholds.lowMaximum
      && thresholds.lowMaximum < thresholds.mediumMaximum
      && thresholds.mediumMaximum < thresholds.highMaximum
    )
  ) {
    throw new IntelligenceDomainError('INVALID_CONFIDENCE', 'Confidence thresholds must be ordered between zero and one.');
  }
  const evidenceIds = new Set<string>();
  for (const item of context.evidence) {
    validateEvidence(item);
    if (evidenceIds.has(item.id)) {
      throw new IntelligenceDomainError('INVALID_EVIDENCE', 'Evidence IDs must be unique.');
    }
    evidenceIds.add(item.id);
  }
}

export function createIntelligenceContext(context: IntelligenceContext): IntelligenceContext {
  validateIntelligenceContext(context);
  return immutableCopy(context) as IntelligenceContext;
}
