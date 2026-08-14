import type { TruthRow } from '@/types/product';

const televisionFields = new Set(['panel', 'hdr', 'refreshrate', 'refresh_rate', 'resolution']);
const televisionTerms = /\b(tv|television|oled|qled|mini[ -]?led|lcd|display|monitor)\b/iu;

function normalizedField(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9_]+/gu, '');
}

export function isTelevisionProduct(truthRows: readonly TruthRow[]): boolean {
  return truthRows.some((row) => {
    if (row.status !== 'Verified') return false;
    const field = normalizedField(row.field);
    return (field === 'producttype' || field === 'product_type' || field === 'type')
      && televisionTerms.test(row.value);
  });
}

export function applicableReadinessRows(truthRows: readonly TruthRow[]): readonly TruthRow[] {
  if (isTelevisionProduct(truthRows)) return truthRows;
  return truthRows.filter((row) => !televisionFields.has(normalizedField(row.field)));
}
