export class ShopifyReviewError extends Error {
  constructor(
    readonly code:
      | 'IMPORT_LINK_REQUIRED'
      | 'LINK_INCONSISTENT'
      | 'REVIEW_NOT_FOUND'
      | 'REVIEW_STALE'
      | 'REVIEW_CONSUMED'
      | 'REVIEW_VERSION_CONFLICT'
      | 'INVALID_DECISION'
      | 'UNRESOLVED_CONFLICT'
      | 'SELECTED_FIELD_BLOCKED'
      | 'REMOTE_CHANGED_AFTER_REVIEW'
      | 'NO_CHANGES_SELECTED'
      | 'SELECTIVE_PUBLISH_FAILED'
      | 'WORKSPACE_FORBIDDEN',
    readonly statusCode: 400 | 403 | 404 | 409 | 500,
    message: string,
  ) {
    super(message);
    this.name = 'ShopifyReviewError';
  }
}

