// qa/v1 — the Qatar draft pack. DRAFT lifecycle, PENDING_LEGAL_REVIEW review
// status, and NOT production-activatable (lifecycle.ts refuses it outside
// local environments).
//
// This pack fabricates nothing. Engineering cannot decide Qatari legal
// bases, retention periods, licence or disclosure requirements, cross-border
// AI permissions, Sharia positions, or capability clearance — so every such
// slot below is the explicit PENDING_LEGAL_REVIEW state with the open
// question stated, and the pack clears NO capability. When legal review
// decides a question, the decision lands as qa/v2 with its approval
// reference; this file is a structure awaiting answers, not a policy.
//
// The declared purpose and retention categories name questions the platform
// already carries (consent module's 'purpose:ai-processing'; the
// DATA_LIFECYCLE.md rows that say "from PolicyPack per jurisdiction, Phase
// 3.5"). Declaring them PENDING here is what turns those deferrals into
// typed, resolvable states instead of prose.

import { jurisdictionId } from '../jurisdiction-id';
import { pendingLegalReview } from '../decision';
import type { PolicyPack } from '../policy-pack';

const DECLARED_AT = new Date('2026-08-16T00:00:00.000Z');

export const QA_V1: PolicyPack = Object.freeze({
  jurisdiction: jurisdictionId('QA'),
  version: 'qa/v1',
  lifecycle: 'DRAFT',
  reviewStatus: 'PENDING_LEGAL_REVIEW',
  // Proposed window for the DRAFT; a draft in force governs only local
  // environments, and approval (qa/v2 or an approved qa/v1 successor) would
  // carry its own reviewed dates rather than rewriting these.
  effectiveFrom: DECLARED_AT,
  effectiveTo: null,

  financialRulesets: Object.freeze({}),
  consentRequirements: pendingLegalReview(
    'Which purposes require consent in Qatar, and against which document kinds, is with legal review. Until decided, consent-gated purposes fail closed in the consent module (ADR-0024).',
  ),
  declaredPurposes: Object.freeze(['purpose:ai-processing']),
  processingBases: Object.freeze({
    'purpose:ai-processing': pendingLegalReview(
      'The lawful basis for AI processing under Qatari data-protection law has not been determined. No basis means the purpose fails closed (ADR-0024).',
    ),
  }),
  retention: Object.freeze({
    'audit-events': pendingLegalReview(
      'The audit-record retention period for Qatar is undecided; the local development placeholder (13 months) lives in policy configuration, never here as a decision.',
    ),
    'consent-evidence': pendingLegalReview(
      'How long consent evidence must outlive the consent under Qatari law is undecided.',
    ),
    'user-profile': pendingLegalReview(
      'Post-closure retention of profile data for Qatar is undecided.',
    ),
  }),
  identityRequirements: pendingLegalReview(
    'Which identity-verification level Qatar requires per capability is undecided; capabilities requiring verified jurisdiction fail closed on UNVERIFIED assignments regardless.',
  ),
  disclosurePolicy: pendingLegalReview(
    'Disclosure obligations and required document kinds for Qatar are undecided. No disclosure-bearing capability is cleared by this pack.',
  ),
  approvalPolicies: Object.freeze({}),
  currencyPolicy: pendingLegalReview(
    'Which currencies the platform may transact or hold for Qatari subjects is undecided. QAR as the QA country formatting default is reference data, not this decision.',
  ),
  aiProcessingPolicy: pendingLegalReview(
    'Whether and under what conditions AI processing (including any cross-border transfer) is permitted for Qatar is undecided. Pending means denied.',
  ),

  // The ceiling is EMPTY: qa/v1 clears no capability, real or synthetic.
  // Positive resolution fixtures are synthetic packs in test files only.
  clearedCapabilities: Object.freeze([]),
  resolutionStrategies: Object.freeze({}),
  subjectPolicyOptions: Object.freeze({}),

  provenance: Object.freeze({
    declaredBy: 'karar-engineering',
    declaredAt: DECLARED_AT,
    source:
      'Phase 3.5 structural draft: establishes the typed shape for legal review; contains no legal decisions.',
  }),
  approvalReference: null,
});

/** Every pack version this build knows. Runtime activation metadata lives in
 * the jurisdiction module's ledger; the packs themselves are only ever code. */
export const POLICY_PACKS: readonly PolicyPack[] = Object.freeze([QA_V1]);
