export function immutablePreferenceValue<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach(immutablePreferenceValue);
  } else {
    Object.values(value as Record<string, unknown>)
      .forEach(immutablePreferenceValue);
  }
  return Object.freeze(value);
}

export function safePreferenceMetadata(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Object.freeze({});
  }
  return immutablePreferenceValue({
    ...(value as Record<string, unknown>),
  });
}
