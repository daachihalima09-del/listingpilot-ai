import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  bindProjectId,
  projectRouteErrorResponse,
  readProjectRequestBody,
  unauthenticatedProjectResponse,
} from '@/modules/projects/server/route-helpers';
import { saveUserProjectState } from '@/modules/projects/server/project-operations';

interface ProjectStateRouteContext {
  params: Promise<{
    projectId: string;
  }>;
}

export async function PATCH(
  request: Request,
  context: ProjectStateRouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return unauthenticatedProjectResponse();
  }

  try {
    const { projectId } = await context.params;
    const body = await readProjectRequestBody(request);
    const project = await saveUserProjectState(
      user.id,
      bindProjectId(body, projectId),
    );
    return NextResponse.json({ project });
  } catch (error) {
    return projectRouteErrorResponse(error);
  }
}
