/**
 * ConsentGate — the port through which gate 6 reads the subject's consent
 * status for a purpose. The real implementation adapts the consent module's
 * public `GetOwnConsentStatus` use case (fail-closed by construction); tests
 * use in-memory fakes. The gate itself decides nothing here: it returns
 * facts, and the domain's consent gate applies the classification matrix.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { ConsentFacts } from '../../domain/resolution.js';

export interface ConsentSubject {
  readonly tenantId: TenantId;
  readonly userId: UserId;
}

export interface ConsentGate {
  /**
   * The consent status for (subject, purpose) in the effective scope at
   * `at`. Adapters throw on infrastructure failure — the resolution fails
   * closed rather than fabricating a status.
   */
  statusFor(
    subject: ConsentSubject,
    purposeRef: string,
    scopeRef: string,
    at: Date,
  ): Promise<ConsentFacts>;
}
