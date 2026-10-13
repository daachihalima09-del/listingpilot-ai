import { z } from 'zod';

const expectedScopes = new Set([
  'read_products', 'write_products', 'read_files', 'write_files',
]);

interface DiagnosticDependencies {
  getUser(): Promise<{ id: string; status: string } | null>;
  getTenant(userId: string, organizationId: string): Promise<{
    role: string;
    organization: { id: string };
  }>;
  readScopes(): string | undefined;
}

function response(body: string | null, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': 'application/json',
      'Vary': 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// Temporary verification only. Remove this handler and route after production verification.
export async function handleShopifyScopesDiagnostic(
  request: Request,
  dependencies: DiagnosticDependencies,
): Promise<Response> {
  try {
    const user = await dependencies.getUser();
    if (!user) return response(null, 401);
    if (user.status !== 'ACTIVE') return response(null, 403);

    const parameters = new URL(request.url).searchParams;
    const organizationIds = parameters.getAll('organizationId');
    if (
      organizationIds.length !== 1
      || [...parameters.keys()].some((key) => key !== 'organizationId')
      || !z.string().uuid().safeParse(organizationIds[0]).success
    ) return response(null, 400);

    let tenant: Awaited<ReturnType<DiagnosticDependencies['getTenant']>>;
    try {
      tenant = await dependencies.getTenant(user.id, organizationIds[0]);
    } catch {
      return response(null, 403);
    }
    if (tenant.role !== 'OWNER' || tenant.organization.id !== organizationIds[0]) {
      return response(null, 403);
    }

    const rawScopes = dependencies.readScopes();
    const scopes = new Set(
      (rawScopes ?? '').split(',').map((scope) => scope.trim()).filter(Boolean),
    );
    return response(JSON.stringify({
      variablePresent: rawScopes !== undefined,
      exactMatch: scopes.size === expectedScopes.size
        && [...expectedScopes].every((scope) => scopes.has(scope)),
      unexpectedScopesPresent: [...scopes].some((scope) => !expectedScopes.has(scope)),
    }), 200);
  } catch {
    // Never expose or log environment values, authentication data, or thrown errors.
    return response(null, 503);
  }
}
