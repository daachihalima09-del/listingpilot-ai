import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createListingGenerationPlan } from '../index.ts';
import { finding, generationInput, truthFindings } from './fixtures.ts';

const moduleRoot = fileURLToPath(new URL('..', import.meta.url));
function sourceFiles(path: string): string[] { return readdirSync(path).flatMap((name) => { const full = `${path}/${name}`; return statSync(full).isDirectory() && name !== 'tests' ? sourceFiles(full) : full.endsWith('.ts') ? [full] : []; }); }
test('module architecture contains no UI, persistence, OpenAI, prompt, network or Shopify mutation dependency', () => {
  const source = sourceFiles(moduleRoot).map((file) => readFileSync(file, 'utf8')).join('\n'); assert.doesNotMatch(source, /from ['"](?:react|next|@\/lib\/prisma)|openai|responses\.create|chat\.completions|fetch\(|productCreate|productUpdate|metafieldsSet|publishablePublish|eval\(|new Function|prompt template/i);
});
test('public API exposes plans, eligibility, selection, parsing and typed errors without fixtures', async () => {
  const api = await import('../index.ts'); for (const name of ['createListingGenerationPlan', 'evaluateGenerationEligibility', 'selectGenerationFacts', 'parseListingGenerationPlan', 'ListingGenerationError']) assert.equal(name in api, true); assert.equal('generationInput' in api, false);
});
test('existing projects need no stored plan or project-state migration', () => {
  const projectSchema = readFileSync(fileURLToPath(new URL('../../projects/validators/project.ts', import.meta.url)), 'utf8'); const moduleSource = sourceFiles(moduleRoot).map((file) => readFileSync(file, 'utf8')).join('\n'); assert.doesNotMatch(projectSchema, /listingGenerationPlan/); assert.doesNotMatch(moduleSource, /prisma|saveProjectState|generatedListing\s*:/i);
});
test('builds 5,000 mixed plans deterministically with bounded aggregate results', () => {
  const television = generationInput(); const generic = generationInput({ pack: null }); const blocked = generationInput({ findings: [...truthFindings().filter(({ fieldPath }) => fieldPath !== 'model'), finding('model', 'X2000', 'CONFLICTED', { importance: 'CRITICAL' })] }); const inputs = [television, generic, blocked]; const counts: Record<string, number> = {};
  let firstFingerprint = ''; for (let index = 0; index < 5_000; index += 1) { const plan = createListingGenerationPlan(inputs[index % inputs.length]!); counts[plan.generationStatus] = (counts[plan.generationStatus] ?? 0) + 1; if (index === 0) firstFingerprint = plan.planFingerprint; if (index % inputs.length === 0) assert.equal(plan.planFingerprint, firstFingerprint); }
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 5_000); assert.equal(counts.READY! > 0, true); assert.equal(counts.READY_WITH_WARNINGS! > 0, true); assert.equal(counts.BLOCKED! > 0, true);
});
