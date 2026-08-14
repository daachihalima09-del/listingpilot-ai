import { z } from 'zod';
import { immutablePreferenceValue } from './immutability.ts';

export const publishingSetupModeSchema = z.enum([
  'LISTINGPILOT_SAFE_DEFAULTS',
  'REVIEW_CURRENT_SHOPIFY_SETUP',
  'MANUAL',
]);
export const publishingAnalysisStatusSchema = z.enum(['NOT_REQUIRED', 'PENDING_ANALYSIS']);
export const publicationStatusPolicySchema = z.enum(['DRAFT', 'ACTIVE_AFTER_APPROVAL', 'ARCHIVED', 'PRESERVE_SOURCE_STATUS']);
export const publishingApprovalModeSchema = z.enum(['ALWAYS_REQUIRE_APPROVAL', 'REQUIRE_APPROVAL_FOR_RISKY_CHANGES', 'ALLOW_APPROVED_AUTOMATION']);
export const existingProductUpdateModeSchema = z.enum(['CREATE_ONLY', 'UPDATE_EXISTING_AFTER_REVIEW', 'UPDATE_MATCHED_FIELDS_ONLY', 'FULL_MANAGED_UPDATE']);
export const fieldPublishingPolicySchema = z.enum(['DO_NOT_PUBLISH', 'PUBLISH_IF_EMPTY', 'PUBLISH_VERIFIED_ONLY', 'PUBLISH_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT', 'PRESERVE_EXISTING']);
export const publishingFieldSchema = z.enum(['TITLE', 'DESCRIPTION', 'VENDOR', 'PRODUCT_TYPE', 'TAGS', 'COLLECTIONS', 'SEO_TITLE', 'SEO_DESCRIPTION', 'URL_HANDLE', 'PRODUCT_STATUS', 'OPTIONS', 'VARIANTS', 'IMAGES', 'METAFIELDS']);

const approvalRequirementsSchema = z.object({
  newProductCreation: z.boolean(), existingProductUpdates: z.boolean(), productStatusChanges: z.boolean(),
  handleChanges: z.boolean(), variantChanges: z.boolean(), variantDeletion: z.boolean(), imageDeletion: z.boolean(),
  seoOverwrites: z.boolean(), metafieldOverwrites: z.boolean(), priceChanges: z.boolean(), inventoryChanges: z.boolean(),
  collectionChanges: z.boolean(), tagReplacement: z.boolean(),
}).strict();

const fieldPolicyEntrySchema = z.object({ field: publishingFieldSchema, policy: fieldPublishingPolicySchema }).strict();
const requiredFields = publishingFieldSchema.options;

const blockerConditionSchema = z.enum([
  'MISSING_REQUIRED_IDENTITY', 'CRITICAL_PRODUCT_TRUTH_CONFLICT', 'AMBIGUOUS_PRODUCT_IDENTITY',
  'MISSING_PRODUCT_INTELLIGENCE_PACK', 'INVALID_VARIANT_STRUCTURE', 'UNSAFE_HANDLE_CHANGE',
  'UNAPPROVED_DESTRUCTIVE_OPERATION', 'INVALID_METAFIELD_VALUE', 'MISSING_EXPLICIT_APPROVAL',
  'STALE_PROJECT_VERSION', 'DISCONNECTED_SHOPIFY_STORE', 'INSUFFICIENT_SHOPIFY_PERMISSIONS',
]);
const blockerEntrySchema = z.object({ condition: blockerConditionSchema, outcome: z.enum(['BLOCK', 'REQUIRE_REVIEW', 'WARN', 'IGNORE']) }).strict();

export const publishingPoliciesSchema = z.object({
  newProductStatus: publicationStatusPolicySchema,
  approval: z.object({ mode: publishingApprovalModeSchema, explicitMerchantActionRequired: z.literal(true), requirements: approvalRequirementsSchema }).strict(),
  existingProductUpdateMode: existingProductUpdateModeSchema,
  fieldPolicies: z.array(fieldPolicyEntrySchema).length(requiredFields.length),
  brandVendor: z.object({ policy: z.enum(['PRESERVE_VENDOR', 'MAP_BRAND_TO_VENDOR', 'USE_CATALOG_PROFILE_MAPPING', 'REQUIRE_REVIEW']) }).strict(),
  handle: z.object({ policy: z.enum(['PRESERVE_EXISTING', 'GENERATE_FOR_NEW_PRODUCTS_ONLY', 'UPDATE_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT']), redirectPolicy: z.enum(['CREATE_REDIRECT_WHEN_SUPPORTED', 'REQUIRE_MANUAL_CONFIRMATION', 'DO_NOT_CREATE_REDIRECT']) }).strict(),
  variants: z.object({
    updateMode: z.enum(['PRESERVE_EXISTING', 'ADD_AND_UPDATE_APPROVED', 'FULL_MANAGED_VARIANTS']),
    deletion: z.enum(['NEVER_DELETE', 'DELETE_AFTER_EXPLICIT_APPROVAL']),
    optionNames: z.enum(['PRESERVE_EXISTING', 'UPDATE_AFTER_APPROVAL']),
    sku: z.enum(['PRESERVE_EXISTING', 'PUBLISH_IF_EMPTY', 'PUBLISH_AFTER_APPROVAL']),
    barcode: z.enum(['PRESERVE_EXISTING', 'PUBLISH_IF_EMPTY', 'PUBLISH_VERIFIED_ONLY']),
    price: z.enum(['PRESERVE_EXISTING', 'PUBLISH_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT']),
    compareAtPrice: z.enum(['PRESERVE_EXISTING', 'PUBLISH_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT']),
  }).strict(),
  inventory: z.object({ policy: z.enum(['NEVER_UPDATE_INVENTORY', 'UPDATE_AFTER_EXPLICIT_APPROVAL', 'EXTERNAL_SYSTEM_MANAGED']), preserveTrackingSettings: z.literal(true), preserveFulfilmentOwnership: z.literal(true), preserveLocationQuantities: z.literal(true) }).strict(),
  images: z.object({
    addition: z.enum(['DO_NOT_ADD', 'ADD_APPROVED_IMAGES', 'ADD_ALL_APPROVED_PIPELINE_IMAGES']),
    existingImages: z.enum(['PRESERVE_ALL', 'REORDER_AFTER_APPROVAL', 'REPLACE_AFTER_EXPLICIT_APPROVAL']),
    deletion: z.enum(['NEVER_DELETE', 'DELETE_AFTER_EXPLICIT_APPROVAL']),
    altText: z.enum(['DO_NOT_PUBLISH', 'PUBLISH_IF_EMPTY', 'PUBLISH_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT']),
    generatedImagesRequireApproval: z.literal(true),
  }).strict(),
  metafields: z.object({
    policy: z.enum(['DO_NOT_PUBLISH', 'PUBLISH_VERIFIED_ONLY', 'PUBLISH_APPROVED_ONLY', 'MANAGE_LISTINGPILOT_NAMESPACE', 'MANAGE_SELECTED_MAPPINGS']),
    namespacePolicy: z.enum(['LISTINGPILOT_NAMESPACE_ONLY', 'APPROVED_NAMESPACES', 'EXISTING_DEFINITIONS_ONLY']),
    approvedNamespaces: z.array(z.string().trim().regex(/^[a-z][a-z0-9_]{1,62}$/u)).max(25),
    preserveUnmanagedMetafields: z.literal(true),
  }).strict(),
  seo: z.object({
    title: z.enum(['PRESERVE_EXISTING', 'PUBLISH_IF_EMPTY', 'PUBLISH_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT']),
    description: z.enum(['PRESERVE_EXISTING', 'PUBLISH_IF_EMPTY', 'PUBLISH_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT']),
    handle: z.enum(['PRESERVE_EXISTING', 'PUBLISH_IF_EMPTY', 'PUBLISH_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT']),
  }).strict(),
  tags: z.object({ mode: z.enum(['PRESERVE_EXISTING', 'APPEND_APPROVED', 'MANAGE_LISTINGPILOT_TAGS', 'REPLACE_AFTER_EXPLICIT_APPROVAL']), normalization: z.enum(['PRESERVE_FORMAT', 'NORMALIZE_APPROVED_TAGS']), removal: z.enum(['NEVER_REMOVE', 'REMOVE_LISTINGPILOT_MANAGED_ONLY', 'REMOVE_AFTER_EXPLICIT_APPROVAL']) }).strict(),
  collections: z.object({ mode: z.enum(['DO_NOT_MANAGE', 'SUGGEST_ONLY', 'ADD_TO_APPROVED_MANUAL_COLLECTIONS', 'MANAGE_APPROVED_COLLECTION_ASSIGNMENTS']), neverManageAutomatedRules: z.literal(true), neverRemoveByDefault: z.literal(true) }).strict(),
  failure: z.object({
    validation: z.enum(['STOP_BEFORE_MUTATION_IF_VALIDATION_FAILS', 'CONTINUE_NON_DESTRUCTIVE_OPERATIONS']),
    retry: z.enum(['ALLOW_SAFE_RETRY', 'NO_AUTOMATIC_RETRY']),
    uncertainState: z.enum(['REQUIRE_MANUAL_RECOVERY', 'RETRY_IF_CONFIRMED_IDEMPOTENT']),
    partialFailure: z.enum(['PRESERVE_PARTIAL_FAILURE_REPORT', 'STOP_REMAINING_OPERATIONS']),
    destructiveRollbackAllowed: z.literal(false),
  }).strict(),
  blockers: z.array(blockerEntrySchema).length(blockerConditionSchema.options.length),
}).strict().superRefine((policies, context) => {
  const fieldNames = policies.fieldPolicies.map(({ field }) => field);
  if (new Set(fieldNames).size !== fieldNames.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Field publishing policies must not contain duplicates.', path: ['fieldPolicies'] });
  for (const field of requiredFields) if (!fieldNames.includes(field)) context.addIssue({ code: z.ZodIssueCode.custom, message: `A publishing policy is required for ${field}.`, path: ['fieldPolicies'] });
  const blockerNames = policies.blockers.map(({ condition }) => condition);
  if (new Set(blockerNames).size !== blockerNames.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Publishing blocker conditions must not contain duplicates.', path: ['blockers'] });
  for (const condition of blockerConditionSchema.options) if (!blockerNames.includes(condition)) context.addIssue({ code: z.ZodIssueCode.custom, message: `A blocker policy is required for ${condition}.`, path: ['blockers'] });
  if (policies.newProductStatus === 'ACTIVE_AFTER_APPROVAL' && (!policies.approval.requirements.newProductCreation || !policies.approval.requirements.productStatusChanges)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Active publication requires creation and status approval.', path: ['newProductStatus'] });
  if (policies.variants.deletion === 'DELETE_AFTER_EXPLICIT_APPROVAL' && !policies.approval.requirements.variantDeletion) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Variant deletion requires explicit approval.', path: ['variants', 'deletion'] });
  if (policies.images.deletion === 'DELETE_AFTER_EXPLICIT_APPROVAL' && !policies.approval.requirements.imageDeletion) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Image deletion requires explicit approval.', path: ['images', 'deletion'] });
  if (policies.inventory.policy === 'UPDATE_AFTER_EXPLICIT_APPROVAL' && !policies.approval.requirements.inventoryChanges) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Inventory updates require explicit approval.', path: ['inventory', 'policy'] });
  if (['UPDATE_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT'].includes(policies.handle.policy) && (!policies.approval.requirements.handleChanges || policies.handle.redirectPolicy === 'DO_NOT_CREATE_REDIRECT')) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Existing handle changes require approval and an explicit redirect safety policy.', path: ['handle'] });
  if (policies.existingProductUpdateMode === 'FULL_MANAGED_UPDATE' && policies.fieldPolicies.every(({ policy }) => ['PRESERVE_EXISTING', 'DO_NOT_PUBLISH'].includes(policy))) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Full managed updates require at least one managed publishing field.', path: ['existingProductUpdateMode'] });
  if (policies.metafields.namespacePolicy === 'APPROVED_NAMESPACES' && policies.metafields.approvedNamespaces.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Approved namespace mode requires at least one namespace.', path: ['metafields', 'approvedNamespaces'] });
  if (policies.metafields.namespacePolicy !== 'APPROVED_NAMESPACES' && policies.metafields.approvedNamespaces.length > 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Namespaces may only be supplied for approved namespace mode.', path: ['metafields', 'approvedNamespaces'] });
  if (policies.tags.mode === 'REPLACE_AFTER_EXPLICIT_APPROVAL' && (policies.tags.removal === 'NEVER_REMOVE' || !policies.approval.requirements.tagReplacement)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Tag replacement requires explicit approval and a compatible removal policy.', path: ['tags'] });
  if (policies.collections.mode === 'MANAGE_APPROVED_COLLECTION_ASSIGNMENTS' && !policies.approval.requirements.collectionChanges) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Managed collection assignments require approval.', path: ['collections'] });
  if (policies.failure.retry === 'NO_AUTOMATIC_RETRY' && policies.failure.uncertainState === 'RETRY_IF_CONFIRMED_IDEMPOTENT') context.addIssue({ code: z.ZodIssueCode.custom, message: 'Retry behavior conflicts with the disabled retry policy.', path: ['failure'] });
});

export type PublishingPolicies = z.infer<typeof publishingPoliciesSchema>;

export const publishingProfileDataSchema = z.object({
  setupMode: publishingSetupModeSchema,
  analysisStatus: publishingAnalysisStatusSchema,
  approved: z.literal(true),
  policies: publishingPoliciesSchema,
}).strict().superRefine((profile, context) => {
  if (profile.setupMode === 'REVIEW_CURRENT_SHOPIFY_SETUP' && profile.analysisStatus !== 'PENDING_ANALYSIS') context.addIssue({ code: z.ZodIssueCode.custom, message: 'Review Current Shopify Setup must remain pending analysis.', path: ['analysisStatus'] });
  if (profile.setupMode !== 'REVIEW_CURRENT_SHOPIFY_SETUP' && profile.analysisStatus !== 'NOT_REQUIRED') context.addIssue({ code: z.ZodIssueCode.custom, message: 'This publishing setup mode does not require analysis.', path: ['analysisStatus'] });
});

export type PublishingProfile = z.infer<typeof publishingProfileDataSchema>;

const safePolicies: PublishingPolicies = {
  newProductStatus: 'DRAFT',
  approval: { mode: 'ALWAYS_REQUIRE_APPROVAL', explicitMerchantActionRequired: true, requirements: { newProductCreation: true, existingProductUpdates: true, productStatusChanges: true, handleChanges: true, variantChanges: true, variantDeletion: true, imageDeletion: true, seoOverwrites: true, metafieldOverwrites: true, priceChanges: true, inventoryChanges: true, collectionChanges: true, tagReplacement: true } },
  existingProductUpdateMode: 'UPDATE_EXISTING_AFTER_REVIEW',
  fieldPolicies: [
    ['TITLE', 'PUBLISH_AFTER_APPROVAL'], ['DESCRIPTION', 'PUBLISH_AFTER_APPROVAL'], ['VENDOR', 'PRESERVE_EXISTING'], ['PRODUCT_TYPE', 'PUBLISH_VERIFIED_ONLY'], ['TAGS', 'PUBLISH_AFTER_APPROVAL'], ['COLLECTIONS', 'DO_NOT_PUBLISH'], ['SEO_TITLE', 'PUBLISH_AFTER_APPROVAL'], ['SEO_DESCRIPTION', 'PUBLISH_AFTER_APPROVAL'], ['URL_HANDLE', 'PRESERVE_EXISTING'], ['PRODUCT_STATUS', 'PUBLISH_AFTER_APPROVAL'], ['OPTIONS', 'PRESERVE_EXISTING'], ['VARIANTS', 'PUBLISH_AFTER_APPROVAL'], ['IMAGES', 'PUBLISH_AFTER_APPROVAL'], ['METAFIELDS', 'PUBLISH_VERIFIED_ONLY'],
  ].map(([field, policy]) => ({ field, policy })) as PublishingPolicies['fieldPolicies'],
  brandVendor: { policy: 'USE_CATALOG_PROFILE_MAPPING' },
  handle: { policy: 'PRESERVE_EXISTING', redirectPolicy: 'CREATE_REDIRECT_WHEN_SUPPORTED' },
  variants: { updateMode: 'PRESERVE_EXISTING', deletion: 'NEVER_DELETE', optionNames: 'PRESERVE_EXISTING', sku: 'PRESERVE_EXISTING', barcode: 'PRESERVE_EXISTING', price: 'PRESERVE_EXISTING', compareAtPrice: 'PRESERVE_EXISTING' },
  inventory: { policy: 'NEVER_UPDATE_INVENTORY', preserveTrackingSettings: true, preserveFulfilmentOwnership: true, preserveLocationQuantities: true },
  images: { addition: 'ADD_APPROVED_IMAGES', existingImages: 'PRESERVE_ALL', deletion: 'NEVER_DELETE', altText: 'PUBLISH_AFTER_APPROVAL', generatedImagesRequireApproval: true },
  metafields: { policy: 'PUBLISH_VERIFIED_ONLY', namespacePolicy: 'EXISTING_DEFINITIONS_ONLY', approvedNamespaces: [], preserveUnmanagedMetafields: true },
  seo: { title: 'PUBLISH_AFTER_APPROVAL', description: 'PUBLISH_AFTER_APPROVAL', handle: 'PRESERVE_EXISTING' },
  tags: { mode: 'APPEND_APPROVED', normalization: 'PRESERVE_FORMAT', removal: 'NEVER_REMOVE' },
  collections: { mode: 'SUGGEST_ONLY', neverManageAutomatedRules: true, neverRemoveByDefault: true },
  failure: { validation: 'STOP_BEFORE_MUTATION_IF_VALIDATION_FAILS', retry: 'ALLOW_SAFE_RETRY', uncertainState: 'REQUIRE_MANUAL_RECOVERY', partialFailure: 'PRESERVE_PARTIAL_FAILURE_REPORT', destructiveRollbackAllowed: false },
  blockers: [
    ['MISSING_REQUIRED_IDENTITY', 'BLOCK'], ['CRITICAL_PRODUCT_TRUTH_CONFLICT', 'BLOCK'], ['AMBIGUOUS_PRODUCT_IDENTITY', 'BLOCK'], ['MISSING_PRODUCT_INTELLIGENCE_PACK', 'WARN'], ['INVALID_VARIANT_STRUCTURE', 'BLOCK'], ['UNSAFE_HANDLE_CHANGE', 'REQUIRE_REVIEW'], ['UNAPPROVED_DESTRUCTIVE_OPERATION', 'BLOCK'], ['INVALID_METAFIELD_VALUE', 'BLOCK'], ['MISSING_EXPLICIT_APPROVAL', 'BLOCK'], ['STALE_PROJECT_VERSION', 'BLOCK'], ['DISCONNECTED_SHOPIFY_STORE', 'BLOCK'], ['INSUFFICIENT_SHOPIFY_PERMISSIONS', 'BLOCK'],
  ].map(([condition, outcome]) => ({ condition, outcome })) as PublishingPolicies['blockers'],
};

export const listingPilotPublishingSafeDefaults: Readonly<PublishingPolicies> = immutablePreferenceValue(publishingPoliciesSchema.parse(safePolicies));

export function createPublishingProfile(setupMode: PublishingProfile['setupMode']): PublishingProfile {
  return publishingProfileDataSchema.parse({
    setupMode,
    analysisStatus: setupMode === 'REVIEW_CURRENT_SHOPIFY_SETUP' ? 'PENDING_ANALYSIS' : 'NOT_REQUIRED',
    approved: true,
    policies: structuredClone(listingPilotPublishingSafeDefaults),
  });
}
