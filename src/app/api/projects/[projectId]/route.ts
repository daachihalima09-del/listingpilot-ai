import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  bindProjectId,
  projectRouteErrorResponse,
  readProjectRequestBody,
  unauthenticatedProjectResponse,
} from '@/modules/projects/server/route-helpers';
import {
  deleteUserProject,
  renameUserProject,
} from '@/modules/projects/server/project-operations';

interface ProjectRouteContext {
  params: Promise<{
    projectId: string;
  }>;
}

export async function PATCH(
  request: Request,
  context: ProjectRouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return unauthenticatedProjectResponse();
  }

  try {
    const { projectId } = await context.params;
    const body = await readProjectRequestBody(request);
    const project = await renameUserProject(
      user.id,
      bindProjectId(body, projectId),
    );
    return NextResponse.json({ project });
  } catch (error) {
    return projectRouteErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: ProjectRouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return unauthenticatedProjectResponse();
  }

  try {
    const { projectId } = await context.params;
    const body = await readProjectRequestBody(request);
    await deleteUserProject(user.id, bindProjectId(body, projectId));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return projectRouteErrorResponse(error);
  }
}
