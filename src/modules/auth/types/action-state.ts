export interface AuthenticationActionState {
  fieldErrors?: Partial<Record<
    'fullName' | 'email' | 'password' | 'passwordConfirmation',
    string[]
  >>;
  formError?: string;
}

export const initialAuthenticationActionState: AuthenticationActionState = {};
