export const expectedProductionDatabaseIdentity = Object.freeze({
  provider: 'postgresql',
  database: 'neondb',
  endpointFamily: 'crimson-sun-ay0s2ifc',
});

export interface SanitizedDatabaseIdentity {
  readonly provider: 'postgresql';
  readonly database: string;
  readonly endpointFamily: string;
}

export function sanitizeDatabaseIdentity(
  connectionString: string,
): SanitizedDatabaseIdentity | null {
  try {
    const parsed = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return null;

    const endpointLabel = parsed.hostname.toLowerCase().split('.')[0] ?? '';
    const endpointFamily = endpointLabel
      .replace(/^ep-/u, '')
      .replace(/-pooler$/u, '');
    const database = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/gu, '');

    if (!endpointFamily || !database) return null;
    return Object.freeze({ provider: 'postgresql', database, endpointFamily });
  } catch {
    return null;
  }
}

export function isExpectedProductionDatabase(
  configured: SanitizedDatabaseIdentity,
  runtimeDatabase: string,
): boolean {
  return configured.provider === expectedProductionDatabaseIdentity.provider
    && configured.database === expectedProductionDatabaseIdentity.database
    && configured.endpointFamily === expectedProductionDatabaseIdentity.endpointFamily
    && runtimeDatabase === expectedProductionDatabaseIdentity.database;
}
