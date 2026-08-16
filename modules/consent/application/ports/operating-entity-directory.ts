/**
 * The consent module's window onto the entity dimension (declared inward;
 * the infrastructure adapter wraps the operating-entity module's public
 * API). Consent needs exactly one resolution: which operating entity is
 * effective for this principal now — user contracting binding first, tenant
 * default second. An unresolvable entity is an expected outcome and fails
 * closed downstream.
 */

import type { Result, TenantId, UserId } from '@karar/shared-kernel';

import type { OperatingEntityRef } from '../../domain/refs.js';
import type { NoEffectiveEntity, StoreFailure } from '../errors.js';

export interface EffectiveEntityResolution {
  readonly entityId: OperatingEntityRef;
}

export interface OperatingEntityDirectory {
  resolveEffectiveEntity(
    tenantId: TenantId,
    userId: UserId | null,
    at: Date,
  ): Promise<Result<EffectiveEntityResolution, NoEffectiveEntity | StoreFailure>>;
}
