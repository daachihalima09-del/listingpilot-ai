const comparisonOutcomes = {
  UNSUPPORTED_FACTUAL_TOKEN: 'UNSUPPORTED_TOKEN_FOUND',
  CITATION_NOT_REPRESENTED: 'CITED_FACT_NOT_REPRESENTED',
  MISSING_FACT_REFERENCES: 'NO_SUPPORTING_CITATIONS',
  SPECIFICATION_CITATION_MISSING: 'NO_SUPPORTING_CITATIONS',
  SPECIFICATION_FACT_NOT_REPRESENTED: 'CITED_FACT_NOT_REPRESENTED',
} as const;

// These are public schema identifiers, never merchant-supplied labels. Custom
// or unknown identifiers must not become a channel for logging product data.
const safeFactFields = new Set([
  'brand', 'model', 'model_number', 'model_suffix', 'product_type', 'type',
  'size', 'screen_size', 'capacity', 'size_or_capacity', 'resolution',
  'technology', 'display_technology', 'panel', 'hdr', 'refresh_rate',
  'smart_platform', 'processor', 'gaming_features', 'audio_output', 'warranty',
  'connectivity', 'ports', 'hdmi', 'hdmi_ports', 'usb_ports', 'dimensions',
  'weight', 'power', 'energy_rating', 'voltage', 'frequency', 'region',
  'version', 'series', 'model_year', 'generation', 'finish', 'color', 'colour',
  'material', 'condition', 'design', 'form_factor', 'programs', 'functions',
  'modes', 'operating_modes', 'control', 'controls', 'remote_control',
  'app_control', 'voice_control', 'temperature_control', 'streaming',
  'room_coverage', 'dust_capacity', 'bin_capacity', 'water_tank_capacity',
  'filtration', 'filter_type', 'additional_filters', 'water_treatment',
  'air_projection', 'airflow', 'suction', 'sensors', 'particle_capture_claim',
  'oscillation', 'runtime', 'cleaner_heads', 'attachments', 'hair_compatibility',
]);

function safeOutputField(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40) return 'UNKNOWN_OUTPUT_FIELD';
  if (['title', 'description', 'seo.title', 'seo.description', 'seo.handle'].includes(value)) return value;
  // Arrays are schema-bounded; reject arbitrary paths and excessively large indices.
  return /^(?:(?:features|whatsIncluded|specifications)\.(?:0|[1-9]\d{0,2})|media\.(?:0|[1-9]\d{0,2})\.altText)$/u.test(value)
    ? value : 'UNKNOWN_OUTPUT_FIELD';
}

export function safeFactualValidationDiagnostic(metadata: unknown) {
  const item = metadata && typeof metadata === 'object'
    ? metadata as Readonly<Record<string, unknown>> : {};
  const reason = typeof item.reason === 'string' && Object.hasOwn(comparisonOutcomes, item.reason)
    ? item.reason as keyof typeof comparisonOutcomes : 'UNCLASSIFIED_FACTUAL_FAILURE';
  const fields = Array.isArray(item.factFieldIds)
    ? item.factFieldIds : typeof item.fieldId === 'string' ? [item.fieldId] : [];
  return {
    reason,
    outputField: safeOutputField(item.outputField),
    factFieldIds: [...new Set(fields.slice(0, 20).map((field) => (
      typeof field === 'string' && safeFactFields.has(field) ? field : 'OTHER_FACT_FIELD'
    )))],
    comparisonOutcome: reason === 'UNCLASSIFIED_FACTUAL_FAILURE'
      ? 'UNKNOWN_COMPARISON' : comparisonOutcomes[reason],
  };
}
