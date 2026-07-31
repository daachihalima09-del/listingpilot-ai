import type {
  ShopifyChangeClassification,
  ShopifyReviewField,
} from './review-types.ts';

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stable).sort());
  if (value && typeof value === 'object') {
    return JSON.stringify(Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
    ));
  }
  return JSON.stringify(value);
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

export function classifyThreeWay(
  baseline: unknown,
  local: unknown,
  remote: unknown,
): ShopifyChangeClassification {
  const b = stable(baseline);
  const l = stable(local);
  const r = stable(remote);
  if (l === b && r === b) return 'UNCHANGED';
  if (!present(baseline)) {
    if (present(local) && !present(remote)) return 'LOCAL_ADDED';
    if (!present(local) && present(remote)) return 'REMOTE_ADDED';
    return l === r ? 'BOTH_CHANGED_SAME' : 'CONFLICT';
  }
  if (!present(local) && !present(remote)) return 'BOTH_REMOVED';
  if (!present(local) && r === b) return 'LOCAL_REMOVED';
  if (!present(remote) && l === b) return 'REMOTE_REMOVED';
  if (!present(local) || !present(remote)) return 'CONFLICT';
  if (l !== b && r === b) return 'LOCAL_CHANGED';
  if (l === b && r !== b) return 'REMOTE_CHANGED';
  return l === r ? 'BOTH_CHANGED_SAME' : 'CONFLICT';
}

export function buildReviewField(input: {
  fieldPath: string;
  label: string;
  resourceType: ShopifyReviewField['resourceType'];
  resourceId?: string | null;
  baselineValue: unknown;
  localValue: unknown;
  remoteValue: unknown;
  publishable?: boolean;
  blocked?: boolean;
  warningCodes?: string[];
}): ShopifyReviewField {
  const classification = input.blocked
    ? 'BLOCKED'
    : classifyThreeWay(input.baselineValue, input.localValue, input.remoteValue);
  const publishable = Boolean(input.publishable) && classification !== 'BLOCKED';
  const availableDecisions = publishable
    ? ['USE_LISTINGPILOT', 'KEEP_SHOPIFY', 'SKIP'] as const
    : ['SKIP'] as const;
  const defaultDecision = classification === 'CONFLICT'
    ? null
    : ['LOCAL_CHANGED', 'LOCAL_ADDED'].includes(classification)
      ? 'USE_LISTINGPILOT' as const
      : classification === 'REMOTE_CHANGED' || classification === 'REMOTE_ADDED'
        ? 'KEEP_SHOPIFY' as const
        : 'SKIP' as const;
  return {
    ...input,
    resourceId: input.resourceId ?? null,
    classification,
    publishable,
    defaultDecision,
    availableDecisions: [...availableDecisions],
    warningCodes: input.warningCodes ?? [],
    blockerCodes: classification === 'BLOCKED' ? ['UNSAFE_CHANGE'] : [],
  };
}

