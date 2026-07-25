export const projectErrorCodes = {
  forbidden: 'PROJECT_FORBIDDEN',
  notFound: 'PROJECT_NOT_FOUND',
  staleWrite: 'PROJECT_STALE_WRITE',
  invalidLifecycle: 'PROJECT_INVALID_LIFECYCLE',
} as const;

export type ProjectErrorCode =
  (typeof projectErrorCodes)[keyof typeof projectErrorCodes];

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  readonly statusCode: 403 | 404 | 409;

  constructor(
    code: ProjectErrorCode,
    message: string,
    statusCode: 403 | 404 | 409,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProjectError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ProjectForbiddenError extends ProjectError {
  constructor() {
    super(
      projectErrorCodes.forbidden,
      'Only an organization owner may perform this action.',
      403,
    );
    this.name = 'ProjectForbiddenError';
  }
}

export class ProjectNotFoundError extends ProjectError {
  constructor() {
    super(
      projectErrorCodes.notFound,
      'The project is unavailable in this workspace.',
      404,
    );
    this.name = 'ProjectNotFoundError';
  }
}

export class ProjectStaleWriteError extends ProjectError {
  constructor() {
    super(
      projectErrorCodes.staleWrite,
      'This project was updated elsewhere. Refresh before saving again.',
      409,
    );
    this.name = 'ProjectStaleWriteError';
  }
}

export class ProjectLifecycleError extends ProjectError {
  constructor(message: string) {
    super(projectErrorCodes.invalidLifecycle, message, 409);
    this.name = 'ProjectLifecycleError';
  }
}
