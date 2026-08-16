/**
 * OperatingEntityDirectory adapter — the consent module's one window onto
 * the entity dimension, wrapping the operating-entity module's exported
 * ResolveEffectiveOperatingEntity use case through its public API
 * (architecture test 3). The returned id is re-branded as this module's own
 * OperatingEntityRef (data-model.md §2: local reference types).
 */

import { Result, type TenantId, type UserId } from '@karar/shared-kernel';
import type { ResolveEffectiveOperatingEntity } from '@karar/operating-entity';

import { OperatingEntityRef } from '../../domain/refs.js';
import type {
  EffectiveEntityResolution,
  OperatingEntityDirectory,
} from '../../application/ports/operating-entity-directory.js';
import type { NoEffectiveEntity, StoreFailure } from '../../application/errors.js';

export class OperatingEntityDirectoryAdapter implements OperatingEntityDirectory {
  constructor(private readonly resolve: ResolveEffectiveOperatingEntity) {}

  async resolveEffectiveEntity(
    tenantId: TenantId,
    userId: UserId | null,
    at: Date,
  ): Promise<Result<EffectiveEntityResolution, NoEffectiveEntity | StoreFailure>> {
    const resolved = await this.resolve.execute({ tenantId, userId, at });
    if (!resolved.ok) {
      return resolved.error.kind === 'NO_EFFECTIVE_ENTITY'
        ? Result.err({ kind: 'NO_EFFECTIVE_ENTITY', message: resolved.error.message })
        : Result.err({ kind: 'STORE_FAILURE', message: resolved.error.message });
    }
    return Result.ok({ entityId: OperatingEntityRef.of(resolved.value.entityId) });
  }
}
