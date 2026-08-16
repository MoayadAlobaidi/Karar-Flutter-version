// Prisma CLI configuration (Prisma 7): CLI commands that need a database
// (db pull for the drift check) read the connection from here. Runtime
// clients never use this — they are built from ConnectionProfiles via
// createPrismaClient (src/db/prisma.ts).
import { defineConfig } from 'prisma/config';

const port = process.env.POSTGRES_PORT ?? process.env.PGPORT ?? '5432';
const host = process.env.KARAR_DB_HOST ?? '127.0.0.1';
const db = process.env.KARAR_DB_NAME ?? process.env.POSTGRES_DB ?? 'karar';
const user = process.env.POSTGRES_USER ?? 'karar';
const password = process.env.POSTGRES_PASSWORD ?? 'karar_dev_password';

export default defineConfig({
  schema: 'prisma/schema',
  datasource: {
    url: `postgresql://${user}:${password}@${host}:${port}/${db}`,
  },
});
