import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  projectRouteErrorResponse,
  readProjectRequestBody,
  unauthenticatedProjectResponse,
} from '@/modules/projects/server/route-helpers';
import { createUserProject } from '@/modules/projects/server/project-operations';

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return unauthenticatedProjectResponse();
  }

  try {
    const input = await readProjectRequestBody(request);
    const project = await createUserProject(user.id, input);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return projectRouteErrorResponse(error);
  }
}
