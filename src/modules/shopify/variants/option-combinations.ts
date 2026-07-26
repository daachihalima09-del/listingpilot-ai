export function createOptionValueCombination(
  options: Array<{ name: string; values: string[] }>,
  selected?: Record<string, string>,
): Array<{ name: string; value: string }> {
  return options.map((option) => ({
    name: option.name,
    value: selected?.[option.name] ?? option.values[0] ?? '',
  }));
}

export function findNextAvailableCombination(
  options: Array<{ name: string; values: string[] }>,
  existing: Array<Array<{ name: string; value: string }>>,
): Array<{ name: string; value: string }> | null {
  if (options.length === 0) return existing.length ? null : [];
  const existingKeys = new Set(existing.map((combination) => (
    combination
      .map(({ name, value }) => `${name.toLocaleLowerCase('en-US')}=${value.toLocaleLowerCase('en-US')}`)
      .join('\u001f')
  )));
  const indices = options.map(() => 0);
  while (true) {
    const combination = options.map((option, index) => ({
      name: option.name,
      value: option.values[indices[index]] ?? '',
    }));
    const key = combination
      .map(({ name, value }) => `${name.toLocaleLowerCase('en-US')}=${value.toLocaleLowerCase('en-US')}`)
      .join('\u001f');
    if (!existingKeys.has(key)) return combination;

    let cursor = indices.length - 1;
    while (cursor >= 0) {
      indices[cursor] += 1;
      if (indices[cursor] < options[cursor].values.length) break;
      indices[cursor] = 0;
      cursor -= 1;
    }
    if (cursor < 0) return null;
  }
}
