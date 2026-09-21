export function workspaceProjectsPath(input: {
  organizationId: string;
  workspaceId: string;
}): string {
  const query = new URLSearchParams({
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
  });
  return `/projects?${query.toString()}`;
}
