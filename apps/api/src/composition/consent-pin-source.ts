/**
 * Supplies the policy provenance a new consent grant pins (migration 0086).
 *
 * The consent module deliberately resolves no policy — it records what a
 * resolver decided. This adapter is that resolver at the edge: the subject's
 * effective jurisdiction, then the pack version active for it in this
 * environment.
 *
 * Returning null is a refusal, not a default. When no jurisdiction is
 * assigned or no pack is active, there is no provenance to record, and the
 * acceptance is declined rather than written unpinned — the schema refuses
 * such a row independently.
 */

import type { Clock, TenantId, UserId } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import { GetActivePackVersion, effectiveJurisdictionState } from '@karar/jurisdiction';
import { PrismaUserJurisdictionAssignmentRepository } from '@karar/jurisdiction/dist/infrastructure/persistence/prisma-assignment-repositories.js';
import {
  PrismaJurisdictionDirectory,
  PrismaPackActivationLedger,
} from '@karar/jurisdiction/dist/infrastructure/persistence/prisma-configuration-repositories.js';
import type { PolicyEnvironment } from '@karar/jurisdiction-policy';
import type {
  ConsentPolicyPinRequest,
  ConsentPolicyPinSource,
} from '@karar/consent/dist/application/ports/policy-pin-source.js';
import type { ConsentPolicyPin } from '@karar/consent/dist/domain/consent-grant.js';

export class JurisdictionConsentPinSource implements ConsentPolicyPinSource {
  private readonly assignments: PrismaUserJurisdictionAssignmentRepository;
  private readonly activePack: GetActivePackVersion;

  constructor(
    prisma: PrismaHandle,
    private readonly environment: PolicyEnvironment,
    private readonly clock: Clock,
  ) {
    this.assignments = new PrismaUserJurisdictionAssignmentRepository(prisma);
    this.activePack = new GetActivePackVersion(
      new PrismaPackActivationLedger(prisma.client),
      new PrismaJurisdictionDirectory(prisma.client),
    );
  }

  async resolvePin(request: ConsentPolicyPinRequest): Promise<ConsentPolicyPin | null> {
    const rows = await this.assignments.listForPrincipal({
      tenantId: request.principal.tenantId as TenantId,
      userId: request.principal.userId as UserId,
    });
    const state = effectiveJurisdictionState(rows, this.clock.now());
    if (state.kind === 'NONE') {
      return null;
    }
    const active = await this.activePack.execute({
      jurisdictionCode: String(state.assignment.jurisdictionCode),
      environment: this.environment,
    });
    if (!active.ok || !active.value.active) {
      return null;
    }
    return {
      policyPackVersion: active.value.packVersion,
      // No capability declares elective options yet — none is implemented —
      // so there is no selection version to pin. The schema records this as
      // NOT_APPLICABLE rather than as an absent pin. When the first elective
      // capability lands, this reads its selection version through
      // subject-policy's GetSelectionVersionForResolution.
      subjectPolicySelectionVersion: null,
    };
  }
}
