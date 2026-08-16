/**
 * LicenceDirectory adapter — gate 7's window onto the operating-entity
 * dimension, wrapping the module's exported `ResolveEffectiveOperatingEntity`
 * use case and its repository PORTS through the public API (architecture
 * test 3; the composition root supplies the Prisma implementations).
 *
 * The adapter reports FACTS only — which entity is effective, whether it is
 * permitted in the scope, and its typed licence references with provenance
 * statuses. Which licences are REQUIRED comes from the policy pack via the
 * resolver; nothing here invents a requirement (qa/v1 declares none), and a
 * licence row never implies a legal fact (ADR-0024).
 */

import {
  isPermittedInJurisdiction,
  JurisdictionRef,
  type EntityLicenceRepository,
  type OperatingEntityRepository,
  type ResolveEffectiveOperatingEntity,
} from '@karar/operating-entity';

import type { LicensingFacts } from '../../domain/resolution.js';
import type {
  LicenceDirectory,
  LicensingSubject,
} from '../../application/ports/licence-directory.js';

export class LicenceDirectoryAdapter implements LicenceDirectory {
  constructor(
    private readonly resolveEntity: ResolveEffectiveOperatingEntity,
    private readonly entities: OperatingEntityRepository,
    private readonly licences: EntityLicenceRepository,
  ) {}

  async licensingContextFor(
    subject: LicensingSubject,
    scopeRef: string,
    at: Date,
  ): Promise<LicensingFacts> {
    const resolved = await this.resolveEntity.execute({
      tenantId: subject.tenantId,
      userId: subject.userId,
      at,
    });
    if (!resolved.ok) {
      if (resolved.error.kind === 'NO_EFFECTIVE_ENTITY') {
        return { kind: 'NO_EFFECTIVE_ENTITY' };
      }
      throw new Error(`operating entity unresolvable: ${resolved.error.message}`);
    }
    const entityId = resolved.value.entityId;
    const permissions = await this.entities.listJurisdictionPermissions(entityId);
    const permittedInScope = isPermittedInJurisdiction(
      permissions,
      JurisdictionRef.of(scopeRef),
      at,
    );
    const licences = await this.licences.listByEntity(entityId);
    return {
      kind: 'ENTITY',
      entityRef: entityId,
      permittedInScope,
      licences: licences.map((licence) => ({
        licenceTypeRef: licence.licenceTypeRef,
        status: licence.status,
        effectiveDate: licence.effectiveDate,
        expiryDate: licence.expiryDate,
      })),
    };
  }
}
