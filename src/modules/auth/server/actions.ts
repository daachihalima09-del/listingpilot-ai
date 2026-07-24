'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { recordAuditLog } from '@/modules/auth/services/audit-log-service';
import {
  DuplicateEmailRegistrationError,
} from '@/modules/auth/types/errors';
import type {
  AuthenticationActionState,
} from '@/modules/auth/types/action-state';
import { auth, signOut } from '@/modules/auth/server/auth';
import {
  signInWithCredentials,
} from '@/modules/auth/server/credentials-auth';
import { getSafeCallbackPath } from '@/modules/auth/server/redirects';
import { registerMerchant } from '@/modules/auth/server/registration';
import {
  createDatabaseSession,
  setDatabaseSessionCookie,
} from '@/modules/auth/server/session';
import {
  signInSchema,
  signUpSchema,
} from '@/modules/auth/validators/credentials';

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function signUpAction(
  _previousState: AuthenticationActionState,
  formData: FormData,
): Promise<AuthenticationActionState> {
  const result = signUpSchema.safeParse({
    fullName: formValue(formData, 'fullName'),
    email: formValue(formData, 'email'),
    password: formValue(formData, 'password'),
    passwordConfirmation: formValue(formData, 'passwordConfirmation'),
  });

  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  let userId: string;
  try {
    const registration = await registerMerchant(result.data);
    userId = registration.userId;
  } catch (error) {
    if (error instanceof DuplicateEmailRegistrationError) {
      return {
        fieldErrors: {
          email: ['An account with this email address already exists.'],
        },
      };
    }
    console.error('Unable to complete merchant registration.', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return {
      formError: 'We could not create your account. Please try again.',
    };
  }

  try {
    const session = await createDatabaseSession(userId);
    await setDatabaseSessionCookie(session);
  } catch (error) {
    console.error('Unable to start the registered merchant session.', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return {
      formError: 'Your account was created. Sign in to continue.',
    };
  }

  redirect(getSafeCallbackPath(formValue(formData, 'callbackUrl')));
}

export async function signInAction(
  _previousState: AuthenticationActionState,
  formData: FormData,
): Promise<AuthenticationActionState> {
  const result = signInSchema.safeParse({
    email: formValue(formData, 'email'),
    password: formValue(formData, 'password'),
  });

  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  const callbackPath = getSafeCallbackPath(formValue(formData, 'callbackUrl'));

  try {
    const responseUrl = await signInWithCredentials('credentials', {
      email: result.data.email,
      password: result.data.password,
      redirect: false,
      redirectTo: callbackPath,
    });

    if (responseUrl.includes('error=CredentialsSignin')) {
      return {
        formError: 'Invalid email or password.',
      };
    }
  } catch (error) {
    if (error instanceof AuthError && error.type === 'CredentialsSignin') {
      return {
        formError: 'Invalid email or password.',
      };
    }
    console.error('Unable to complete merchant sign-in.', {
      type: error instanceof AuthError ? error.type : 'UnknownError',
    });
    return {
      formError: 'Unable to sign in right now. Please try again.',
    };
  }

  redirect(callbackPath);
}

export async function signOutAction(): Promise<void> {
  const session = await auth();

  if (session?.user) {
    try {
      await recordAuditLog({
        userId: session.user.id,
        action: 'auth.logout',
        entityType: 'User',
        entityId: session.user.id,
      });
    } catch {
      // Audit failures are already logged safely and must not prevent sign-out.
    }
  }

  try {
    await signOut({ redirectTo: '/sign-in' });
  } catch (error) {
    if (error instanceof AuthError) {
      console.error('Auth.js could not terminate the session.', {
        type: error.type,
      });
    }
    throw error;
  }
}
