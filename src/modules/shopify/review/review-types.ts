export const shopifyChangeClassifications = [
  'UNCHANGED',
  'LOCAL_CHANGED',
  'REMOTE_CHANGED',
  'BOTH_CHANGED_SAME',
  'CONFLICT',
  'LOCAL_ADDED',
  'REMOTE_ADDED',
  'LOCAL_REMOVED',
  'REMOTE_REMOVED',
  'BOTH_REMOVED',
  'UNSUPPORTED',
  'BLOCKED',
] as const;

export type ShopifyChangeClassification =
  typeof shopifyChangeClassifications[number];
export type ShopifyReviewDecision =
  | 'USE_LISTINGPILOT'
  | 'KEEP_SHOPIFY'
  | 'SKIP';

export interface ShopifyReviewField {
  fieldPath: string;
  label: string;
  resourceType: 'PRODUCT' | 'VARIANT' | 'METAFIELD' | 'MEDIA';
  resourceId: string | null;
  classification: ShopifyChangeClassification;
  baselineValue: unknown;
  localValue: unknown;
  remoteValue: unknown;
  publishable: boolean;
  defaultDecision: ShopifyReviewDecision | null;
  availableDecisions: ShopifyReviewDecision[];
  warningCodes: string[];
  blockerCodes: string[];
}

export interface ShopifyChangeReviewPayload {
  schemaVersion: '1';
  projectId: string;
  workspaceId: string;
  shopifyStoreId: string;
  shopifyProductGid: string;
  baselineShopifyUpdatedAt: string;
  remoteShopifyUpdatedAt: string;
  generatedAt: string;
  summary: {
    totalChanges: number;
    localChanges: number;
    remoteChanges: number;
    conflicts: number;
    blocked: number;
  };
  fields: ShopifyReviewField[];
  blockers: string[];
  warnings: string[];
}

