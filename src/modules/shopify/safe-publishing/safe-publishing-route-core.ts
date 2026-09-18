function safeErrorMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { type: typeof error };

  const candidate = error as Error & {
    code?: unknown;
    requestId?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };

  return {
    name: error.name,
    ...(typeof candidate.code === 'string' ? { code: candidate.code } : {}),
    ...(typeof candidate.status === 'number' ? { status: candidate.status } : {}),
    ...(typeof candidate.statusCode === 'number' ? { statusCode: candidate.statusCode } : {}),
    ...(typeof candidate.requestId === 'string' ? { providerRequestId: candidate.requestId } : {}),
  };
}

export function createUnexpectedPublishingFailure(
  error: unknown,
  createReference: () => string = crypto.randomUUID,
) {
  const reference = createReference();
  return {
    reference,
    log: { reference, ...safeErrorMetadata(error) },
    body: {
      error: {
        code: 'SHOPIFY_PUBLISHING_UNAVAILABLE',
        message: `Safe Shopify publishing is temporarily unavailable. Reference: ${reference}.`,
        reference,
      },
    },
  } as const;
}
