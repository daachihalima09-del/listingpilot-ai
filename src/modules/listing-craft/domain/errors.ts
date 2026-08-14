export class ListingCraftError extends Error {
  readonly code: 'INVALID_CRAFT_PACK' | 'DUPLICATE_CRAFT_PACK' | 'DUPLICATE_STANDARD_OWNERSHIP';

  constructor(
    code: 'INVALID_CRAFT_PACK' | 'DUPLICATE_CRAFT_PACK' | 'DUPLICATE_STANDARD_OWNERSHIP',
    message: string,
  ) {
    super(message);
    this.name = 'ListingCraftError';
    this.code = code;
  }
}
