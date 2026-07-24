import 'server-only';

import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/modules/auth/services/password';
import {
  registerMerchantWithDatabase,
  type RegistrationDatabase,
} from '@/modules/auth/services/registration';
import type { ValidatedSignUpInput } from '@/modules/auth/validators/credentials';

export async function registerMerchant(input: ValidatedSignUpInput) {
  const passwordHash = await hashPassword(input.password);

  return registerMerchantWithDatabase(
    prisma as unknown as RegistrationDatabase,
    input,
    passwordHash,
  );
}
