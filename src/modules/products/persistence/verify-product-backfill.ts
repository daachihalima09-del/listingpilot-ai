import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: ['.env.local', '.env'], quiet: true });
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('Database configuration is unavailable.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

interface CountRow { count: bigint }

async function scalar(query: TemplateStringsArray): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(query[0]);
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const [projects, products, projectsWithoutProduct, stateMismatches, linksWithoutProduct, plansWithoutProduct, executionsWithoutProduct] = await Promise.all([
    scalar`SELECT COUNT(*)::bigint AS count FROM "projects"`,
    scalar`SELECT COUNT(*)::bigint AS count FROM "products"`,
    scalar`SELECT COUNT(*)::bigint AS count FROM "projects" p WHERE NOT EXISTS (SELECT 1 FROM "products" product WHERE product."project_id" = p."id")`,
    scalar`SELECT COUNT(*)::bigint AS count FROM "projects" p JOIN "products" product ON product."id" = p."id" WHERE product."project_id" <> p."id" OR product."workspace_id" <> p."workspace_id" OR product."generated_listing" IS DISTINCT FROM p."generated_listing" OR product."analysis_data" IS DISTINCT FROM p."analysis_data"`,
    scalar`SELECT COUNT(*)::bigint AS count FROM "shopify_product_import_links" WHERE "product_id" IS NULL`,
    scalar`SELECT COUNT(*)::bigint AS count FROM "shopify_publishing_plans" WHERE "product_id" IS NULL`,
    scalar`SELECT COUNT(*)::bigint AS count FROM "shopify_publication_executions" WHERE "product_id" IS NULL`,
  ]);
  const result = {
    projects,
    products,
    projectsWithoutProduct,
    stateMismatches,
    linksWithoutProduct,
    plansWithoutProduct,
    executionsWithoutProduct,
    valid: projectsWithoutProduct === 0
      && stateMismatches === 0
      && linksWithoutProduct === 0
      && plansWithoutProduct === 0
      && executionsWithoutProduct === 0,
  };
  console.log(JSON.stringify(result));
  if (!result.valid) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
