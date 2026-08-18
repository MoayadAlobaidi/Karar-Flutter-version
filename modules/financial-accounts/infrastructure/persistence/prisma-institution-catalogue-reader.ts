/**
 * `InstitutionCatalogueReader` over Prisma.
 *
 * **No principal context is bound here, and that is correct.** The catalogue
 * is PUBLIC platform reference data with no tenant, user, or subject column
 * to build a predicate from (migration 0087); it is carried on the RLS
 * allow-list rather than RLS-protected, because there is no principal
 * predicate that fits reference data. Wrapping these reads in
 * `withPrincipalContext` would suggest a scoping that does not exist and
 * would break the one legitimate pre-tenant use — rendering a picker before a
 * tenant is bound.
 *
 * There is deliberately no write path: `karar_app` holds SELECT and nothing
 * else on this table, and the catalogue changes by reviewed migration.
 */

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { InstitutionCatalogueReader } from '../../application/ports/institution-catalogue-reader.js';
import type { Institution } from '../../domain/institution.js';
import type { InstitutionRef } from '../../domain/refs.js';
import { toInstitution } from './row-mappers.js';

export class PrismaInstitutionCatalogueReader implements InstitutionCatalogueReader {
  constructor(private readonly handle: PrismaHandle) {}

  async listSelectable(): Promise<readonly Institution[]> {
    const rows = await this.handle.client.institution.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
    });
    return rows.map(toInstitution);
  }

  async findByRef(ref: InstitutionRef): Promise<Institution | null> {
    // Returns RETIRED entries too: an existing account still has to render
    // its institution's name, and hiding it would make old records
    // unreadable. Selectability for a NEW account is the domain's question.
    const row = await this.handle.client.institution.findUnique({ where: { id: ref } });
    return row === null ? null : toInstitution(row);
  }
}
