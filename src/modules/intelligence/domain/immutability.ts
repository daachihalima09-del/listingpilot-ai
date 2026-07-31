function cloneValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) clone.push(cloneValue(item, seen));
    return clone;
  }
  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const [key, item] of Object.entries(value)) clone[key] = cloneValue(item, seen);
  return clone;
}

function freezeValue<T>(value: T, seen: WeakSet<object>): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeValue(child, seen);
  return Object.freeze(value);
}

export function immutableCopy<T>(value: T): Readonly<T> {
  return freezeValue(cloneValue(value, new WeakMap()) as T, new WeakSet());
}

export function deepFreeze<T>(value: T): Readonly<T> {
  return freezeValue(value, new WeakSet());
}
