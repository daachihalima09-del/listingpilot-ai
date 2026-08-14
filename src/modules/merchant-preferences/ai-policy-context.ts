import { immutablePreferenceValue } from './immutability.ts';
import { createMerchantPreferenceRegistry } from './default-registry.ts';
import { resolveEffectiveAiProfile, type EffectiveAiProfile } from './effective-ai-profile.ts';
import type { AiPolicies } from './ai-profile.ts';

export interface AiPolicyContext {
  readonly factualStrictness: AiPolicies['factualStrictness']; readonly creativity: AiPolicies['creativity']; readonly uncertainty: AiPolicies['uncertainty']; readonly missingInformation: AiPolicies['missingInformation']; readonly conflicts: AiPolicies['conflicts']; readonly evidence: AiPolicies['evidence']; readonly explanation: AiPolicies['explanation']; readonly regeneration: AiPolicies['regeneration']; readonly localization: AiPolicies['localization']; readonly toneVariation: AiPolicies['toneVariation']; readonly prohibitedActions: AiPolicies['prohibitedActions']; readonly highRisk: AiPolicies['highRisk']; readonly humanReviewThresholds: AiPolicies['humanReviewThresholds']; readonly bulk: AiPolicies['bulk']; readonly qualityTier: AiPolicies['modelPolicy']['qualityTier']; readonly maxRetries: number; readonly maxRegenerations: number; readonly profileVersion: 1; readonly aiExecutionAllowed: false;
}

export function createAiPolicyContext(effective: EffectiveAiProfile = resolveEffectiveAiProfile(null, createMerchantPreferenceRegistry())): AiPolicyContext {
  const policies = effective.policies;
  return immutablePreferenceValue({ factualStrictness: policies.factualStrictness, creativity: policies.creativity, uncertainty: policies.uncertainty, missingInformation: policies.missingInformation, conflicts: policies.conflicts, evidence: policies.evidence, explanation: policies.explanation, regeneration: policies.regeneration, localization: policies.localization, toneVariation: policies.toneVariation, prohibitedActions: policies.prohibitedActions, highRisk: policies.highRisk, humanReviewThresholds: policies.humanReviewThresholds, bulk: policies.bulk, qualityTier: policies.modelPolicy.qualityTier, maxRetries: policies.modelPolicy.maxRetries, maxRegenerations: policies.modelPolicy.maxRegenerations, profileVersion: 1, aiExecutionAllowed: false });
}
