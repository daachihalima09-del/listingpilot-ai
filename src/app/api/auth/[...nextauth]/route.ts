import { handlers } from '@/modules/auth/server/auth';

export const runtime = 'nodejs';

export const { GET, POST } = handlers;
