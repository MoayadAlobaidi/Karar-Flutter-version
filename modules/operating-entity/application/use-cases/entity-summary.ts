/**
 * The one client-safe read this module exposes to consumer surfaces: WHICH
 * legal person is effective for a principal, projected onto the reviewed safe
 * field set (`ports/entity-summary-reader.ts` carries the field-by-field
 * review and the exclusions).
 *
 * AUTHORIZATION SHAPE — resolution-scoped, not id-scoped. The caller supplies
 * only its OWN principal; the entity id is derived from that principal's
 * binding, so no caller can name an entity and no caller can enumerate the
 * register. This is the compensating control the RLS allow-list records for
 * `operating_entities` (rls-allow-list.json): the table is platform-global and
 * carries no tenant column, so consumer reads are purpose-built to return only
 * the resolution the caller is entitled to. The binding read underneath
 * (`operating_entity_assignments`) is itself scoped to the supplied tenant and
 * user by the resolution query.
 *
 * Unaudited and unauthorized-by-permission on purpose, exactly as
 * `ResolveEffectiveOperatingEntity` is: this is a subject learning who it
 * contracted with, on a path executed on every bootstrap call.
 *
 * NOT_FOUND when the binding names an entity the register does not hold is a
 * broken invariant, reported as a failure rather than papered over with a
 * partial or invented summary.
 */

import { Result, type TenantId, type UserId } from '@karar/shared-kernel';

import type { NotFound, StoreFailure } from '../errors.js';
import { toStoreFailure } from '../errors.js';
import type {
  OperatingEntitySummary,
  OperatingEntitySummaryReader,
} from '../ports/entity-summary-reader.js';
import {
  ResolveEffectiveOperatingEntity,
  type NoEffectiveEntity,
} from './entity-assignments.js';

export interface GetEffectiveOperatingEntitySummaryInput {
  readonly tenantId: TenantId;
  readonly userId: UserId | null;
  readonly at: Date;
}

export type GetEffectiveOperatingEntitySummaryError = NoEffectiveEntity | NotFound | StoreFailure;

export class GetEffectiveOperatingEntitySummary {
  constructor(
    private readonly resolve: ResolveEffectiveOperatingEntity,
    private readonly summaries: OperatingEntitySummaryReader,
  ) {}

  async execute(
    input: GetEffectiveOperatingEntitySummaryInput,
  ): Promise<Result<OperatingEntitySummary, GetEffectiveOperatingEntitySummaryError>> {
    const resolved = await this.resolve.execute({
      tenantId: input.tenantId,
      userId: input.userId,
      at: input.at,
    });
    if (!resolved.ok) {
      return resolved;
    }
    let summary: OperatingEntitySummary | null;
    try {
      summary = await this.summaries.findSummaryById(resolved.value.entityId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (summary === null) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'operating_entity',
        id: resolved.value.entityId,
      });
    }
    return Result.ok(summary);
  }
}
