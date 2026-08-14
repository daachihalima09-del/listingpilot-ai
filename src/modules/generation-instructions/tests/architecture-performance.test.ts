import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createListingGenerationPlan } from '../../listing-generation/index.ts';
import { finding, generationInput, truthFindings } from '../../listing-generation/tests/fixtures.ts';
import { createGenerationInstructions } from '../index.ts';

const moduleRoot = fileURLToPath(new URL('..', import.meta.url));
function sourceFiles(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const fullPath = `${path}/${name}`;
    if (statSync(fullPath).isDirectory() && name !== 'tests') return sourceFiles(fullPath);
    return fullPath.endsWith('.ts') ? [fullPath] : [];
  });
}

test('instruction architecture consumes the plan contract without upstream data or execution dependencies', () => {
  const source = sourceFiles(moduleRoot).map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /product-truth|product-intelligence|merchant-preferences|shopify|prisma|react|next\/|fetch\(|responses\.create|chat\.completions|streaming|prompt template|generatedText|eval\(|new Function/i);
  assert.doesNotMatch(source, /GPT|Claude|Gemini|OpenAI|Anthropic/i);
  assert.match(source, /listing-generation\/domain\/contracts/);
});

test('public API exports the builder, validator and compatibility parser without fixtures', async () => {
  const api = await import('../index.ts');
  for (const name of [
    'createGenerationInstructions',
    'validateGenerationInstructionPackage',
    'validateGenerationInstructionsAgainstPlan',
    'parseGenerationInstructions',
    'GenerationInstructionError',
  ]) assert.equal(name in api, true);
  assert.equal('generationInput' in api, false);
});

test('builds 5,000 mixed instruction packages deterministically', () => {
  const plans = [
    createListingGenerationPlan(generationInput()),
    createListingGenerationPlan(generationInput({ pack: null })),
    createListingGenerationPlan(generationInput({
      findings: [
        ...truthFindings().filter(({ fieldPath }) => fieldPath !== 'model'),
        finding('model', 'X2000', 'CONFLICTED', { importance: 'CRITICAL' }),
      ],
    })),
  ];
  const counts: Record<string, number> = {};
  let firstFingerprint = '';
  for (let index = 0; index < 5_000; index += 1) {
    const instructions = createGenerationInstructions(plans[index % plans.length]!);
    const status = instructions.sourcePlan.generationStatus;
    counts[status] = (counts[status] ?? 0) + 1;
    if (index === 0) firstFingerprint = instructions.instructionFingerprint;
    if (index % plans.length === 0) assert.equal(instructions.instructionFingerprint, firstFingerprint);
  }
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 5_000);
  assert.equal(counts.READY! > 0, true);
  assert.equal(counts.READY_WITH_WARNINGS! > 0, true);
  assert.equal(counts.BLOCKED! > 0, true);
});
