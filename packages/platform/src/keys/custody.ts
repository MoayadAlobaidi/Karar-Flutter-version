/**
 * Provider-independent key custody, recovery, and rotation policies
 * (ADR-0017, amended: custody is outcome-based; no single custody model is
 * universally mandated).
 *
 * These are declarations a deployment profile makes and a readiness review
 * verifies — not runtime behaviour. The universal requirement they must
 * jointly satisfy, before any production SEALED data exists: an approved and
 * tested way to **prevent unrecoverable key loss** and to **detect key
 * unavailability** (the sealed-integrity canary, canary.ts).
 *
 * Rotation-vs-identifier rule (enforced by test in keys.test.ts):
 * fingerprints, dedup hashes, and business identifiers must derive from
 * **content**, never from key material or ciphertext. Ciphertext changes on
 * every rotation and on every fresh IV; an identifier derived from it would
 * silently change identity on rotation. A content hash is rotation-stable;
 * ciphertext is deliberately not.
 */

import type { KeyRef } from './refs.js';

/**
 * The four named custody models of ADR-0017 (names illustrative there,
 * canonical here). Another approved model requires an ADR amendment first.
 */
export const KEY_CUSTODY_MODELS = [
  'CLOUD_KMS_MANAGED',
  'BYOK_IMPORTED_WITH_EXTERNAL_CUSTODY',
  'EXTERNAL_KEY_MANAGER',
  'HSM_MANAGED',
] as const;

export type KeyCustodyModel = (typeof KEY_CUSTODY_MODELS)[number];

/**
 * Which custody model applies to a key, where its material lives, and the
 * separation of duties appropriate to that model — IAM separation, deletion
 * protection, and multi-region configuration for a managed-KMS model;
 * split-controlled external material for a BYOK/external model.
 */
export interface KeyCustodyStrategy {
  readonly keyRef: KeyRef;
  readonly model: KeyCustodyModel;
  /** Where key material lives, in provider-neutral terms (never a resource name). */
  readonly keyMaterialLocation: string;
  /**
   * The separation-of-duties statement for this model: who can use, who can
   * administer, who can destroy — and that no single person holds all three.
   */
  readonly separationOfDuties: string;
}

/**
 * The documented recovery/continuity procedure appropriate to the custody
 * model, its separation of duties, and whether the recovery drill is
 * technically applicable (ADR-0017: rehearsed and timed **where technically
 * applicable** — a managed-KMS model without exportable material substitutes
 * a continuity procedure for a material-restore drill).
 */
export interface KeyRecoveryPolicy {
  readonly keyRef: KeyRef;
  /** Reference to the written procedure (a document, not the procedure itself). */
  readonly procedureRef: string;
  readonly separationOfDuties: string;
  readonly drill:
    | { readonly applicability: 'REQUIRED'; readonly cadence: string }
    | { readonly applicability: 'NOT_TECHNICALLY_APPLICABLE'; readonly justification: string };
}

/**
 * Rotation cadence and mechanics — designed in from Phase 2, not retrofitted
 * — plus destruction safeguards. Destruction safeguards exist because the
 * failure mode is not rotation failing but rotation *succeeding* and the old
 * version being destroyed while data still references it (legacy ENC-2: the
 * production key "has already been lost once").
 */
export interface KeyRotationPolicy {
  readonly keyRef: KeyRef;
  /** ISO-8601 duration between rotations, e.g. 'P90D'. */
  readonly cadence: string;
  /** How rotation happens for this provider/model, in outcome terms. */
  readonly mechanics: string;
  /**
   * The safeguards that prevent destroying a key version that ciphertext
   * still references: retention window before destroy, a reference check, and
   * who must approve destruction (never the same role that rotates).
   */
  readonly destructionSafeguards: string;
}
