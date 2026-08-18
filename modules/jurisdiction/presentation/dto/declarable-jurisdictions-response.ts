/**
 * Response serialization for the declarable-reference listing — a CLOSED field
 * set, picked by name, so nothing the register carries or later gains (the
 * provenance prose, the lifecycle stage, the review status, the reviewed
 * effective window) can reach a client by accident.
 *
 * `approvalRecorded` is emitted explicitly and is false for every entry the
 * platform holds today. Reporting it is the point: a selectable jurisdiction
 * is a DECLARABLE one, and a field that says no approval is recorded is
 * stronger than documentation that says so.
 */

import type { DeclarableJurisdiction } from '../../application/use-cases/declarable-jurisdictions.js';

export function toDeclarableReferencesResponse(references: readonly DeclarableJurisdiction[]) {
  return {
    references: references.map((reference) => ({
      jurisdictionId: reference.jurisdictionId,
      code: reference.code,
      countryCode: reference.countryCode,
      countryDisplayNameKey: reference.countryDisplayNameKey,
      type: reference.type,
      approvalRecorded: reference.approvalRecorded === true,
    })),
  };
}
