// Prisma runtime factory — the ONLY sanctioned way to construct a Prisma
// client. It rides @prisma/adapter-pg over a pg Pool built from the same
// ConnectionProfile machinery AND the same session configuration as the raw
// adapter, so connection truth stays in profiles (database-portability.md §2).
// This pool previously set none of the session defaults the raw adapter set —
// no application_name, no statement_timeout, no lock_timeout, no TLS mapping —
// which is exactly how a session property can be true on one path and false on
// the other while every test passes. Prisma types must not escape
// infrastructure/persistence code (architecture test 4).
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../prisma/client/index.js';
import type { ConnectionProfile } from './connection-profile.js';
import { poolConfigFor } from './session-config.js';

export type { PrismaClient } from '../../prisma/client/index.js';

export interface PrismaHandle {
  readonly client: PrismaClient;
  readonly pool: Pool;
  end(): Promise<void>;
}

export function createPrismaClient(profile: ConnectionProfile): PrismaHandle {
  const pool = new Pool(poolConfigFor(profile));
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
