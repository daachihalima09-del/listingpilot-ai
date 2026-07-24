import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  CredentialUser,
  CredentialUserRepository,
} from '@/modules/auth/services/credentials';

export const credentialUserRepository: CredentialUserRepository = {
  async findByEmail(email: string): Promise<CredentialUser | null> {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        status: true,
      },
    });
  },
};
