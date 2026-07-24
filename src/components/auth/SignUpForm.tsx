'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  authInputClassName,
  FieldError,
  SubmitButton,
} from '@/components/auth/AuthFormFields';
import { signUpAction } from '@/modules/auth/server/actions';
import { initialAuthenticationActionState } from '@/modules/auth/types/action-state';

export function SignUpForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState(
    signUpAction,
    initialAuthenticationActionState,
  );
  const signInHref = callbackUrl === '/'
    ? '/sign-in'
    : `/sign-in?${new URLSearchParams({ callbackUrl })}`;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      {state.formError ? (
        <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {state.formError}
        </div>
      ) : null}

      <div>
        <label htmlFor="fullName" className="text-sm font-medium text-slate-200">Full name</label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          maxLength={200}
          aria-invalid={Boolean(state.fieldErrors?.fullName)}
          aria-describedby={state.fieldErrors?.fullName ? 'full-name-error' : undefined}
          className={authInputClassName}
          placeholder="Alex Morgan"
        />
        <FieldError id="full-name-error" messages={state.fieldErrors?.fullName} />
      </div>

      <div>
        <label htmlFor="email" className="text-sm font-medium text-slate-200">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? 'email-error' : undefined}
          className={authInputClassName}
          placeholder="you@company.com"
        />
        <FieldError id="email-error" messages={state.fieldErrors?.email} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className="text-sm font-medium text-slate-200">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            aria-invalid={Boolean(state.fieldErrors?.password)}
            aria-describedby={state.fieldErrors?.password ? 'password-error' : 'password-help'}
            className={authInputClassName}
            placeholder="Create a password"
          />
          <p id="password-help" className="mt-2 text-xs leading-5 text-slate-500">
            8+ characters with uppercase, lowercase, and a number.
          </p>
          <FieldError id="password-error" messages={state.fieldErrors?.password} />
        </div>

        <div>
          <label htmlFor="passwordConfirmation" className="text-sm font-medium text-slate-200">Confirm password</label>
          <input
            id="passwordConfirmation"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            required
            maxLength={128}
            aria-invalid={Boolean(state.fieldErrors?.passwordConfirmation)}
            aria-describedby={state.fieldErrors?.passwordConfirmation ? 'password-confirmation-error' : undefined}
            className={authInputClassName}
            placeholder="Repeat your password"
          />
          <FieldError id="password-confirmation-error" messages={state.fieldErrors?.passwordConfirmation} />
        </div>
      </div>

      <SubmitButton>Create account</SubmitButton>

      <p className="text-center text-sm text-slate-400">
        Already have an account?{' '}
        <Link
          href={signInHref}
          className="font-semibold text-amber-300 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
