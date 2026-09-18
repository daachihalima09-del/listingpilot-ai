import { createHash } from 'node:crypto';

export const aiOperationTypes = [
  'PRODUCT_ANALYSIS',
  'LISTING_GENERATION',
  'SECTION_REGENERATION',
] as const;

export type AiOperationType = typeof aiOperationTypes[number];

export type AiProtectionErrorCode =
  | 'DAILY_AI_LIMIT_REACHED'
  | 'MONTHLY_AI_LIMIT_REACHED'
  | 'AI_CONCURRENCY_LIMIT_REACHED'
  | 'AI_OPERATION_ALREADY_RUNNING'
  | 'AI_OPERATION_ALREADY_COMPLETED'
  | 'REQUEST_RATE_LIMITED';

const messages: Record<AiProtectionErrorCode, string> = {
  DAILY_AI_LIMIT_REACHED: "You've reached today's AI usage limit for this workspace. Try again tomorrow or contact support.",
  MONTHLY_AI_LIMIT_REACHED: "You've reached this month's AI usage limit for this workspace. Contact support for early-access assistance.",
  AI_CONCURRENCY_LIMIT_REACHED: 'This workspace already has the maximum number of AI operations running. Try again when one finishes.',
  AI_OPERATION_ALREADY_RUNNING: 'This AI operation is already running. Wait for it to finish before trying again.',
  AI_OPERATION_ALREADY_COMPLETED: 'This exact AI operation has already completed. Refresh to load the latest saved state.',
  REQUEST_RATE_LIMITED: 'Too many requests were received. Wait a moment and try again.',
};

export class AiProtectionError extends Error {
  readonly code: AiProtectionErrorCode;
  readonly statusCode: 409 | 429;
  readonly retryAfterSeconds: number | null;

  constructor(code: AiProtectionErrorCode, retryAfterSeconds: number | null = null) {
    super(messages[code]);
    this.name = 'AiProtectionError';
    this.code = code;
    this.statusCode = code.startsWith('AI_OPERATION_ALREADY_') ? 409 : 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function canonicalPart(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalPart);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalPart(item)]));
  }
  return value;
}

export function secureKey(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalPart(value))).digest('hex');
}

export function safeAiErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 100);
  }
  return error instanceof Error ? error.name.slice(0, 100) : 'UNKNOWN_ERROR';
}
