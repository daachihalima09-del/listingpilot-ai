export type ListingDraftErrorCode =
  | 'DRAFT_GENERATION_BLOCKED'
  | 'DRAFT_INVALID_PROVIDER_OUTPUT'
  | 'DRAFT_FORBIDDEN_FACT'
  | 'DRAFT_INVENTED_VALUE'
  | 'DRAFT_POLICY_VIOLATION'
  | 'DRAFT_NOT_FOUND'
  | 'DRAFT_STALE_WRITE'
  | 'DRAFT_FORBIDDEN'
  | 'DRAFT_PROVIDER_FAILED';

export class ListingDraftError extends Error {
  readonly code: ListingDraftErrorCode;
  readonly statusCode: number;
  readonly metadata: Readonly<Record<string, unknown>>;

  constructor(
    code: ListingDraftErrorCode,
    message: string,
    statusCode: number,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'ListingDraftError';
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
  }
}
