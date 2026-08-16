/**
 * LicenceDirectory — the port through which gate 7 reads the licensing
 * context: which operating entity is effective for the subject, whether that
 * entity may lawfully operate in the effective scope, and which typed
 * licence references it holds. The real implementation adapts the
 * operating-entity module's public API; a licence row is a typed reference
 * with provenance, never a legal fact (ADR-0024), and the domain gate
 * accepts only evidence-satisfying, in-window references.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { LicensingFacts } from '../../domain/resolution.js';

export interface LicensingSubject {
  readonly tenantId: TenantId;
  readonly userId: UserId | null;
}

export interface LicenceDirectory {
  /**
   * The licensing context for the subject in `scopeRef` at `at`. Adapters
   * throw on infrastructure failure — the resolution fails closed.
   */
  licensingContextFor(
    subject: LicensingSubject,
    scopeRef: string,
    at: Date,
  ): Promise<LicensingFacts>;
}
