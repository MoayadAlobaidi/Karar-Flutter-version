/**
 * The dependency bundle every identity use case receives, plus the two
 * write-through helpers that make the module's failure stance uniform:
 *
 * - `recordSecurity`: append to the authentication security ledger, guarding
 *   metadata first. A ledger the flow cannot write is a control that is OFF
 *   (the lockout derivation counts these rows), so a store failure fails the
 *   flow CLOSED with DEPENDENCY_UNAVAILABLE rather than proceeding
 *   unrecorded.
 * - `auditOrFail`: record through @karar/audit's use case; same stance —
 *   an unrecorded audit event cannot be recovered later (legacy AZ5).
 */

import type { Clock } from '@karar/shared-kernel';
import type { RecordAuditEvent } from '@karar/audit';
import { ErrorCode, PlatformError } from '@karar/platform/dist/errors/index.js';
import type { NotificationPort } from '@karar/platform/dist/notifications/index.js';
import type {
  RateLimitKeyHasher,
  RateLimitService,
} from '@karar/platform/dist/ratelimit/index.js';

import type { IdentityPolicy } from '../domain/identity-policy.js';
import type {
  SecurityEvent,
  SecurityEventMetadata,
  SecurityEventType,
} from '../domain/security-event.js';
import type {
  CredentialDigester,
  MfaSecretCipher,
  PasswordHasher,
  SecretSource,
  TokenSigner,
  TotpService,
} from './ports/crypto-ports.js';
import type {
  AccountRepository,
  MfaRepository,
  ResetRequestRepository,
  SessionRepository,
  VerificationRepository,
} from './ports/identity-repositories.js';
import type { SecurityEventRecorder } from './ports/security-event-recorder.js';

export interface IdentityDependencies {
  readonly accounts: AccountRepository;
  readonly verifications: VerificationRepository;
  readonly resets: ResetRequestRepository;
  readonly sessions: SessionRepository;
  readonly mfa: MfaRepository;
  readonly securityEvents: SecurityEventRecorder;
  readonly passwordHasher: PasswordHasher;
  readonly tokenSigner: TokenSigner;
  readonly digester: CredentialDigester;
  readonly secretSource: SecretSource;
  readonly totp: TotpService;
  readonly mfaCipher: MfaSecretCipher;
  readonly notifications: NotificationPort;
  readonly recordAudit: RecordAuditEvent;
  readonly rateLimits: RateLimitService;
  readonly rateLimitKeys: RateLimitKeyHasher;
  readonly clock: Clock;
  readonly policy: IdentityPolicy;
  /** Asserted environment identity, stamped into audit rows. */
  readonly environment: string;
}

/** The per-request client facts a use case may see: digested/summarized only. */
export interface ClientContext {
  /** HMAC digest from CredentialDigester.ipDigest — never a raw address. */
  readonly ipDigest: string | null;
  /** From summarizeUserAgent — never a raw user agent. */
  readonly userAgentSummary: string | null;
}

export class SecurityMetadataViolation extends Error {
  override readonly name = 'SecurityMetadataViolation';
}

// Key shapes that must never appear in ledger metadata; a match is a defect
// at the call site, not an expected outcome. Exact-match names catch the
// generic spellings; the pattern catches credential-shaped compounds.
const FORBIDDEN_EXACT_KEYS = new Set(['code', 'token', 'hash', 'secret', 'password', 'email']);
const FORBIDDEN_KEY_PATTERN = /password|passphrase|secret|authorization|apikey|api_key|email/i;
const MAX_METADATA_VALUE_LENGTH = 200;

export function guardSecurityMetadata(
  metadata: SecurityEventMetadata | null | undefined,
): SecurityEventMetadata | null {
  if (metadata === null || metadata === undefined) return null;
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.toLowerCase();
    if (FORBIDDEN_EXACT_KEYS.has(normalizedKey) || FORBIDDEN_KEY_PATTERN.test(key)) {
      throw new SecurityMetadataViolation(
        `security-event metadata key '${key}' is credential-shaped — the ledger records facts about credentials, never credentials`,
      );
    }
    if (typeof value === 'string' && value.length > MAX_METADATA_VALUE_LENGTH) {
      throw new SecurityMetadataViolation(
        `security-event metadata value for '${key}' exceeds ${MAX_METADATA_VALUE_LENGTH} chars — a payload is not metadata`,
      );
    }
  }
  return metadata;
}

export interface RecordSecurityInput {
  readonly accountId: string | null;
  readonly eventType: SecurityEventType;
  readonly ipDigest?: string | null;
  readonly metadata?: SecurityEventMetadata | null;
}

export async function recordSecurity(
  deps: IdentityDependencies,
  input: RecordSecurityInput,
): Promise<void> {
  const event: SecurityEvent = {
    accountId: input.accountId,
    eventType: input.eventType,
    occurredAt: deps.clock.now(),
    ipDigest: input.ipDigest ?? null,
    metadata: guardSecurityMetadata(input.metadata),
  };
  const outcome = await deps.securityEvents.record(event);
  if (!outcome.ok) {
    throw new PlatformError({
      code: ErrorCode.DEPENDENCY_UNAVAILABLE,
      message: 'The security ledger is unavailable; the request was not processed.',
      origin: 'application',
      retryable: true,
      cause: outcome.error,
    });
  }
}

export interface AuditInput {
  readonly action: string;
  readonly accountId: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export async function auditOrFail(
  deps: IdentityDependencies,
  input: AuditInput,
): Promise<void> {
  const result = await deps.recordAudit.execute({
    occurredAt: deps.clock.now(),
    environment: deps.environment,
    actorRef: input.accountId === null ? null : `user:${input.accountId}`,
    tenantRef: null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    afterMetadata: input.metadata ?? null,
    outcome: input.outcome,
  });
  if (!result.ok) {
    throw new PlatformError({
      code: ErrorCode.DEPENDENCY_UNAVAILABLE,
      message: 'The audit trail is unavailable; the request was not processed.',
      origin: 'application',
      retryable: true,
      cause: result.error,
    });
  }
}
