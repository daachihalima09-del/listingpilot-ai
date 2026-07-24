export type DemoAnalysisInput =
  | { kind: 'raw-specifications' }
  | { kind: 'supplier-url'; url: string }
  | { kind: 'product-url'; url: string }
  | { kind: 'uploaded-pdf'; filename: string };

export interface DemoAnalysisContext {
  sourceLabel: 'Raw specifications' | 'Supplier URL' | 'Product URL' | 'Uploaded PDF';
  notice: string;
}

export function isValidHttpUrl(value: string) {
  if (!/^https?:\/\//i.test(value.trim())) {
    return false;
  }

  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase();
    return Boolean(hostname) && hostname !== 'http' && hostname !== 'https' && !hostname.endsWith('.http') && !hostname.endsWith('.https');
  } catch {
    return false;
  }
}

/**
 * Recovers a common paste mistake: a full URL being inserted after an existing
 * `https://` or `https://www.` prefix in the field.
 */
export function normalizePastedHttpUrl(value: string) {
  const nestedProtocol = value.match(/^https?:\/\/(?:www\.)?(https?:\/\/.*)$/i);
  return nestedProtocol ? nestedProtocol[1] : value;
}

export function isPdfFileName(filename: string) {
  return filename.toLowerCase().endsWith('.pdf');
}
