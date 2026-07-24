import 'server-only';

import { parseServerEnv } from '@/modules/auth/validators/environment';

export const env = parseServerEnv(process.env);
