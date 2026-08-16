/**
 * ConsentGate adapter — gate 6's window onto the consent module, wrapping
 * its exported `GetOwnConsentStatus` use case through the public API
 * (architecture test 3). Fail-closed mapping, stated exhaustively:
 *
 *  - ACTIVE / WITHDRAWN / RECONSENT_REQUIRED / NO_GRANT map onto the
 *    domain's consent facts unchanged (the domain gate applies the matrix);
 *  - no published document (documentId null) surfaces as
 *    documentAvailable=false — the gate denies rather than failing open
 *    (the inversion of legacy AI-5);
 *  - NO_EFFECTIVE_ENTITY and AMBIGUOUS_JURISDICTION are expected consent
 *    outcomes that cannot establish an ACTIVE grant — they map to a closed
 *    NO_GRANT with no document;
 *  - STORE_FAILURE throws, so the resolution as a whole fails closed
 *    instead of fabricating a consent status.
 */

import type { GetOwnConsentStatus } from '@karar/consent';

import type { ConsentFacts } from '../../domain/resolution.js';
import type { ConsentGate, ConsentSubject } from '../../application/ports/consent-gate.js';

export class ConsentGateAdapter implements ConsentGate {
  constructor(private readonly status: GetOwnConsentStatus) {}

  async statusFor(
    subject: ConsentSubject,
    purposeRef: string,
    scopeRef: string,
    at: Date,
  ): Promise<ConsentFacts> {
    const resolved = await this.status.execute({
      principal: { tenantId: subject.tenantId, userId: subject.userId },
      purposeRef,
      jurisdictionRef: scopeRef,
      now: at,
    });
    if (!resolved.ok) {
      if (resolved.error.kind === 'STORE_FAILURE') {
        throw new Error(`consent status unavailable: ${resolved.error.message}`);
      }
      // NO_EFFECTIVE_ENTITY / AMBIGUOUS_JURISDICTION: no grant can resolve.
      return { kind: 'STATUS', state: 'NO_GRANT', documentAvailable: false };
    }
    return {
      kind: 'STATUS',
      state: resolved.value.state,
      documentAvailable: resolved.value.documentId !== null,
    };
  }
}
