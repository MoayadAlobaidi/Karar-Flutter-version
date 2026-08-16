/**
 * Response serialization for the self-declaration surface — a CLOSED field
 * set, picked by name, so nothing an upstream change adds to the assignment
 * row (the reason text, the assigning principal ref, the row id, the
 * superseded window) can reach the client by accident.
 *
 * `state` is emitted explicitly and is always UNVERIFIED. Reporting it is the
 * point: the client must not read a successful declaration as verification,
 * and a field that says so is stronger than documentation that says so.
 */

import type { DeclaredJurisdiction } from '../../application/use-cases/self-declaration.js';

export function toDeclarationResponse(declared: DeclaredJurisdiction) {
  return {
    state: String(declared.assignment.verificationStatus),
    jurisdictionId: String(declared.assignment.jurisdictionCode),
    source: String(declared.assignment.source),
    effectiveFrom: declared.assignment.effectiveFrom.toISOString(),
    /** False when the caller re-declared what was already in effect. */
    recorded: declared.recorded === true,
  };
}
