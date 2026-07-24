'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  authInputClassName,
  FieldError,
  SubmitButton,
} from '@/components/auth/AuthFormFields';
import { signInAction } from '@/modules/auth/server/actions';
import { initialAuthenticationActionState } from '@/modules/auth/types/action-state';

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState(
    signInAction,
    initialAuthenticationActionState,
  );
  const signUpHref = callbackUrl === '/'
    ? '/sign-up'
    : `/sign-up?${new URLSearchParams({ callbackUrl })}`;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      {state.formError ? (
        <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {state.formError}
        </div>
      ) : null}

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

      <div>
        <label htmlFor="password" className="text-sm font-medium text-slate-200">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? 'password-error' : undefined}
          className={authInputClassName}
          placeholder="Enter your password"
        />
        <FieldError id="password-error" messages={state.fieldErrors?.password} />
      </div>

      <SubmitButton>Sign in</SubmitButton>

      <p className="text-center text-sm text-slate-400">
        New to ListingPilot?{' '}
        <Link
          href={signUpHref}
          className="font-semibold text-amber-300 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
