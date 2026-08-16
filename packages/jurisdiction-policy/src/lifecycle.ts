// Pack lifecycle predicates — pure, environment-aware, fail-closed.
//
// canActivate answers "may this pack version become the OPERATIVE pack for
// an environment now"; canResolveExplicitVersion answers "may a historical
// record still resolve against this exact version". The two differ on
// RETIRED only: a retired pack can never be newly activated, but records
// created under it remain resolvable forever — effective dates and
// retirement never rewrite history.
//
// The environment rule (jurisdiction-policy.md §2): local development and
// tests may load DRAFT and PENDING_LEGAL_REVIEW packs; every other
// environment requires APPROVED — and APPROVED means lifecycle APPROVED
// *with* a non-empty approvalReference. A lifecycle field claiming APPROVED
// with no evidence is refused everywhere, including locally: the field is
// not the approval, the evidence is.

import type { PolicyEnvironment } from './environment';
import type { PolicyPack } from './policy-pack';

export type ActivationDenialReason =
  | {
      readonly kind: 'LIFECYCLE_NOT_ACTIVATABLE';
      readonly lifecycle: PolicyPack['lifecycle'];
      readonly environment: PolicyEnvironment;
      readonly message: string;
    }
  | {
      readonly kind: 'APPROVAL_EVIDENCE_MISSING';
      readonly message: string;
    };

export type ActivationDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reasons: readonly ActivationDenialReason[] };

const ALLOWED: ActivationDecision = Object.freeze({ allowed: true });

function denied(reasons: readonly ActivationDenialReason[]): ActivationDecision {
  return Object.freeze({ allowed: false, reasons: Object.freeze([...reasons]) });
}

function approvalEvidenceMissing(pack: PolicyPack<string>): ActivationDenialReason {
  return {
    kind: 'APPROVAL_EVIDENCE_MISSING',
    message:
      `pack ${pack.version} declares lifecycle APPROVED with no approvalReference — ` +
      `absence of evidence means not approved`,
  };
}

export function canActivate<Id extends string>(
  pack: PolicyPack<Id>,
  environment: PolicyEnvironment,
): ActivationDecision {
  if (pack.lifecycle === 'RETIRED') {
    return denied([
      {
        kind: 'LIFECYCLE_NOT_ACTIVATABLE',
        lifecycle: pack.lifecycle,
        environment,
        message: `pack ${pack.version} is RETIRED; retired versions resolve historically but are never re-activated`,
      },
    ]);
  }
  if (pack.lifecycle === 'APPROVED') {
    if (pack.approvalReference === null || pack.approvalReference.trim() === '') {
      return denied([approvalEvidenceMissing(pack)]);
    }
    return ALLOWED;
  }
  // DRAFT and PENDING_LEGAL_REVIEW: local only.
  if (environment === 'local') {
    return ALLOWED;
  }
  return denied([
    {
      kind: 'LIFECYCLE_NOT_ACTIVATABLE',
      lifecycle: pack.lifecycle,
      environment,
      message:
        `pack ${pack.version} is ${pack.lifecycle} and '${environment}' is not a local ` +
        `environment — unapproved packs never activate outside local development and tests`,
    },
  ]);
}

/** Historical resolution: RETIRED is additionally permitted (with approval
 * evidence when the lifecycle passed through APPROVED — a retired pack that
 * was never approved is still local-only). */
export function canResolveExplicitVersion<Id extends string>(
  pack: PolicyPack<Id>,
  environment: PolicyEnvironment,
): ActivationDecision {
  if (pack.lifecycle !== 'RETIRED') {
    return canActivate(pack, environment);
  }
  if (environment === 'local') {
    return ALLOWED;
  }
  if (pack.approvalReference === null || pack.approvalReference.trim() === '') {
    return denied([
      {
        kind: 'APPROVAL_EVIDENCE_MISSING',
        message:
          `retired pack ${pack.version} carries no approvalReference — a version that was ` +
          `never approved cannot govern historical records outside local environments`,
      },
    ]);
  }
  return ALLOWED;
}
