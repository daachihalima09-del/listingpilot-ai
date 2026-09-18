export interface AiWorkspaceLimits {
  readonly daily: number;
  readonly monthly: number;
  readonly concurrent: number;
}

export interface AiUsageConfiguration {
  readonly enabled: boolean;
  readonly defaults: AiWorkspaceLimits;
  readonly overrides: Readonly<Record<string, Partial<AiWorkspaceLimits>>>;
  readonly leaseSeconds: number;
}

const DEFAULT_DAILY_LIMIT = 25;
const DEFAULT_MONTHLY_LIMIT = 300;
const DEFAULT_CONCURRENT_LIMIT = 2;
const DEFAULT_LEASE_SECONDS = 300;

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`Invalid ${name} configuration.`);
  return parsed;
}

function enabled(value: string | undefined): boolean {
  if (value === undefined || value === '') return true;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Invalid AI_USAGE_LIMITS_ENABLED configuration.');
}

function parseOverrides(value: string | undefined): Readonly<Record<string, Partial<AiWorkspaceLimits>>> {
  if (!value?.trim()) return {};
  let decoded: unknown;
  try { decoded = JSON.parse(value); } catch { throw new Error('Invalid AI_USAGE_WORKSPACE_OVERRIDES configuration.'); }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('Invalid AI_USAGE_WORKSPACE_OVERRIDES configuration.');
  }
  const result: Record<string, Partial<AiWorkspaceLimits>> = {};
  for (const [workspaceId, candidate] of Object.entries(decoded)) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(workspaceId)
      || !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('Invalid AI_USAGE_WORKSPACE_OVERRIDES configuration.');
    }
    const override: { daily?: number; monthly?: number; concurrent?: number } = {};
    for (const key of ['daily', 'monthly', 'concurrent'] as const) {
      const configured = (candidate as Record<string, unknown>)[key];
      if (configured !== undefined) {
        if (!Number.isSafeInteger(configured) || Number(configured) < 1) {
          throw new Error('Invalid AI_USAGE_WORKSPACE_OVERRIDES configuration.');
        }
        override[key] = Number(configured);
      }
    }
    if (Object.keys(candidate).some((key) => !['daily', 'monthly', 'concurrent'].includes(key))) {
      throw new Error('Invalid AI_USAGE_WORKSPACE_OVERRIDES configuration.');
    }
    result[workspaceId] = override;
  }
  return result;
}

export function readAiUsageConfiguration(source: Record<string, string | undefined> = process.env): AiUsageConfiguration {
  return {
    enabled: enabled(source.AI_USAGE_LIMITS_ENABLED),
    defaults: {
      daily: positiveInteger(source.AI_USAGE_DAILY_LIMIT, DEFAULT_DAILY_LIMIT, 'AI_USAGE_DAILY_LIMIT'),
      monthly: positiveInteger(source.AI_USAGE_MONTHLY_LIMIT, DEFAULT_MONTHLY_LIMIT, 'AI_USAGE_MONTHLY_LIMIT'),
      concurrent: positiveInteger(source.AI_USAGE_MAX_CONCURRENT, DEFAULT_CONCURRENT_LIMIT, 'AI_USAGE_MAX_CONCURRENT'),
    },
    overrides: parseOverrides(source.AI_USAGE_WORKSPACE_OVERRIDES),
    leaseSeconds: positiveInteger(source.AI_USAGE_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 'AI_USAGE_LEASE_SECONDS'),
  };
}

export function limitsForWorkspace(configuration: AiUsageConfiguration, workspaceId: string): AiWorkspaceLimits {
  return { ...configuration.defaults, ...configuration.overrides[workspaceId] };
}

export interface RateLimitPolicy { readonly maximum: number; readonly windowSeconds: number }

const rateDefaults: Record<string, RateLimitPolicy> = {
  SIGN_IN: { maximum: 10, windowSeconds: 15 * 60 },
  ANALYSIS_PRINCIPAL: { maximum: 30, windowSeconds: 10 * 60 },
  PRODUCT_ANALYSIS: { maximum: 10, windowSeconds: 10 * 60 },
  LISTING_GENERATION: { maximum: 10, windowSeconds: 10 * 60 },
  SECTION_REGENERATION: { maximum: 20, windowSeconds: 10 * 60 },
  REMOTE_IMAGE_IMPORT: { maximum: 30, windowSeconds: 10 * 60 },
};

export type RateLimitAction = keyof typeof rateDefaults;

export function rateLimitPolicy(action: RateLimitAction, source: Record<string, string | undefined> = process.env): RateLimitPolicy {
  const key = `RATE_LIMIT_${action}_MAXIMUM`;
  return {
    maximum: positiveInteger(source[key], rateDefaults[action].maximum, key),
    windowSeconds: rateDefaults[action].windowSeconds,
  };
}
