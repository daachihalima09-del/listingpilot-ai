import { config as loadEnvironment } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

loadEnvironment({
  path: ['.env.local', '.env'],
  quiet: true,
});

function migrationConnectionUrl(): string {
  const url = new URL(env('DIRECT_URL'));
  // Prisma's schema engine currently rejects Neon's channel_binding option.
  // The application driver still receives the original URL; migrations retain
  // the configured TLS mode while removing only this unsupported CLI option.
  url.searchParams.delete('channel_binding');
  return url.toString();
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: migrationConnectionUrl(),
  },
});
