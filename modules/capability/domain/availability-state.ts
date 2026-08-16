/**
 * The stored availability-state vocabulary — CLOSED (capability-registry.md
 * §3). A row's state is configuration; whether a capability is actually
 * reachable is the resolver's MEET over every gate, and a missing row is
 * DISABLED (deny by default). State is modelled separately from denial
 * reason: the row stores one of these, the resolution reports a
 * DenialReason.
 */

export const AVAILABILITY_STATES = [
  'AVAILABLE',
  'BETA',
  'INTERNAL_ONLY',
  'PARTNER_ONLY',
  'DISABLED',
  'PENDING_PROVIDER',
  'PENDING_LEGAL_REVIEW',
  'PENDING_REGULATORY_REVIEW',
] as const;

export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

export function isAvailabilityState(value: string): value is AvailabilityState {
  return (AVAILABILITY_STATES as readonly string[]).includes(value);
}

/**
 * The ONLY states under which a capability may resolve as exposed. Every
 * other state denies: DISABLED and PENDING_* by their own meaning;
 * INTERNAL_ONLY and PARTNER_ONLY deny in this phase because no
 * internal/partner audience model exists yet — a state that cannot be
 * checked must not widen access (restrict-only).
 */
export const ALLOWING_STATES = ['AVAILABLE', 'BETA'] as const;

export type AllowingState = (typeof ALLOWING_STATES)[number];

export function isAllowingState(state: AvailabilityState): state is AllowingState {
  return (ALLOWING_STATES as readonly AvailabilityState[]).includes(state);
}

/** A capability_availability row, as domain vocabulary. */
export interface CapabilityAvailabilityRecord {
  readonly id: string;
  readonly environment: string;
  /** Null = environment-wide row; a jurisdiction-specific row is narrower. */
  readonly jurisdictionRef: string | null;
  readonly capabilityId: string;
  readonly state: AvailabilityState;
  readonly reason: string;
  readonly actorRef: string;
  readonly version: number;
}
