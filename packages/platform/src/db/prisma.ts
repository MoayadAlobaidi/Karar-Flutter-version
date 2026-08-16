// Prisma runtime factory — the ONLY sanctioned way to construct a Prisma
// client. It rides @prisma/adapter-pg over a pg Pool built from the same
// ConnectionProfile machinery as the raw adapter, so connection truth stays in
// profiles (database-portability.md §2). Prisma types must not escape
// infrastructure/persistence code (architecture test 4).
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../prisma/client/index.js';
import type { ConnectionProfile } from './connection-profile.js';

export type { PrismaClient } from '../../prisma/client/index.js';

export interface PrismaHandle {
  readonly client: PrismaClient;
  readonly pool: Pool;
  end(): Promise<void>;
}

export function createPrismaClient(profile: ConnectionProfile): PrismaHandle {
  const pool = new Pool({
    host: profile.host,
    port: profile.port,
    database: profile.database,
    user: profile.user,
    password: profile.password.unwrap(),
    max: profile.poolMax,
  });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });
  return {
    client,
    pool,
    end: async () => {
      await client.$disconnect();
      await pool.end();
    },
  };
}
