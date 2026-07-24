import type { UserStatus } from '@prisma/client';
import type { ValidatedSignInInput } from '@/modules/auth/validators/credentials';

export interface CredentialUser {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  status: UserStatus;
}

export interface CredentialUserRepository {
  findByEmail(email: string): Promise<CredentialUser | null>;
}

export type PasswordVerifier = (
  passwordHash: string,
  password: string,
) => Promise<boolean>;

export async function authenticateCredentials(
  repository: CredentialUserRepository,
  input: ValidatedSignInInput,
  verifyPassword: PasswordVerifier,
  dummyPasswordHash: string,
): Promise<Omit<CredentialUser, 'passwordHash'> | null> {
  const user = await repository.findByEmail(input.email);
  const passwordHash = user?.passwordHash ?? dummyPasswordHash;
  const passwordMatches = await verifyPassword(passwordHash, input.password);

  if (!user || !user.passwordHash || !passwordMatches || user.status !== 'ACTIVE') {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
  };
}
