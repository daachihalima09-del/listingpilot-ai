import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { neovixCraftRulePack, projectCraftPack, validateDraftCraftCompliance } from '../index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
function files(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const target = `${path}/${name}`;
    if (statSync(target).isDirectory() && name !== 'tests') return files(target);
    return target.endsWith('.ts') ? [target] : [];
  });
}

test('core Craft framework has no UI, persistence, route, provider SDK or mutation dependency', () => {
  const source = files(root).map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /prisma|react|next\/|api\/|responses-client|openai|shopify\/admin|publishing|fetch\(|eval\(|new Function/i);
});

test('5,000 mixed compliance checks are deterministic and side-effect free', () => {
  const craft = projectCraftPack(neovixCraftRulePack);
  const facts = [{ factId: 'brand', fieldId: 'brand', value: 'Acme', truthStatus: 'VERIFIED' }, { factId: 'model', fieldId: 'model', value: 'X1000', truthStatus: 'VERIFIED' }];
  const statuses: Record<string, number> = {};
  let first = '';
  for (let index = 0; index < 5_000; index += 1) {
    const result = validateDraftCraftCompliance({
      craft,
      facts,
      draft: {
        title: { value: index % 3 === 0 ? 'Acme Television X1000' : 'X1000 Acme Television', factIds: ['brand', 'model'] },
        overview: { value: index % 2 === 0 ? 'Acme Television.\n\nModel X1000.' : 'Acme Television.', factIds: ['brand', 'model'] },
        specifications: [{ label: 'Model', value: 'X1000', factIds: ['model'] }],
        features: [{ value: 'Acme Television', factIds: ['brand'] }],
      },
    });
    statuses[result.status] = (statuses[result.status] ?? 0) + 1;
    if (index === 0) first = JSON.stringify(result);
    if (index === 3_000) assert.equal(JSON.stringify(result), first);
  }
  assert.equal(Object.values(statuses).reduce((sum, count) => sum + count, 0), 5_000);
});
