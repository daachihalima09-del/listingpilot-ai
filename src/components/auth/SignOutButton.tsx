'use client';

import { LogOut } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { signOutAction } from '@/modules/auth/server/actions';

function SignOutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <SignOutSubmitButton />
    </form>
  );
}
