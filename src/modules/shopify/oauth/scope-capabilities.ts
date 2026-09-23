const supportedScopeImplications: Readonly<Record<string, readonly string[]>> = {
  write_products: ['read_products'],
  write_files: ['read_files'],
};

export interface ShopifyScopeCapabilityResult {
  effectiveGrantedScopes: string[];
  missingRequiredScopes: string[];
  satisfied: boolean;
}

export function evaluateShopifyScopeCapabilities(input: {
  requiredScopes: readonly string[];
  grantedScopes: readonly string[];
}): ShopifyScopeCapabilityResult {
  const effectiveGrantedScopes = new Set(input.grantedScopes);

  for (const grantedScope of input.grantedScopes) {
    for (const impliedScope of supportedScopeImplications[grantedScope] ?? []) {
      effectiveGrantedScopes.add(impliedScope);
    }
  }

  const missingRequiredScopes = [...new Set(input.requiredScopes)]
    .filter((scope) => !effectiveGrantedScopes.has(scope));

  return {
    effectiveGrantedScopes: [...effectiveGrantedScopes].sort(),
    missingRequiredScopes,
    satisfied: missingRequiredScopes.length === 0,
  };
}
