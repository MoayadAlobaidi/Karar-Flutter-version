/**
 * The seam through which a caller obtains the policy provenance a new consent
 * grant pins (data-model.md §5; migration 0086).
 *
 * The consent module resolves no policy and reads no PolicyPack — doing so
 * would put jurisdictional behaviour inside a module that must stay neutral
 * (architecture test 12). It records what a resolver already decided. This
 * port is how the edge obtains that decision; the composition root binds it to
 * the real resolution path.
 *
 * `null` means no policy is in force to pin. That is a refusal, not a default:
 * the caller declines to record rather than writing a grant whose provenance
 * nobody resolved, and the schema refuses such a row independently.
 */

import type { ConsentPolicyPin } from '../../domain/consent-grant.js';
import type { ConsentPrincipal } from './consent-grant-repository.js';

export interface ConsentPolicyPinRequest {
  readonly principal: ConsentPrincipal;
  readonly purposeRef: string;
  readonly at: Date;
}

export interface ConsentPolicyPinSource {
  resolvePin(request: ConsentPolicyPinRequest): Promise<ConsentPolicyPin | null>;
}
