/**
 * UpdateOwnProfile — the approved-fields-only write path. Phase 3 approves
 * exactly two subject-editable fields: `displayName` and `locale`. The input
 * type carries nothing else, and the implementation reads nothing else —
 * status, residency, entity, and tenant fields cannot be smuggled through
 * this use case no matter what a client sent (presentation drops unknown
 * fields; this layer never sees them; the repository writes only these two).
 */

import type { Clock } from '@karar/shared-kernel';
import { Result } from '@karar/shared-kernel';

import { requirePrincipal, type PrincipalActor } from '../principal.js';
import type { UpdateOwnProfileError } from '../errors.js';
import type {
  OwnProfileFieldChanges,
  UserProfileRepository,
} from '../ports/user-profile-repository.js';
import { parseDisplayName, parseLocale, type UserProfile } from '../../domain/user-profile.js';

export interface UpdateOwnProfileInput {
  readonly displayName?: string;
  readonly locale?: string;
}

export class UpdateOwnProfile {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: UpdateOwnProfileInput,
    actor: PrincipalActor,
  ): Promise<Result<UserProfile, UpdateOwnProfileError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) {
      return principal;
    }

    let changes: OwnProfileFieldChanges = { occurredAt: this.clock.now() };
    if (input.displayName !== undefined) {
      const parsed = parseDisplayName(input.displayName);
      if (!parsed.ok) {
        return Result.err({
          kind: 'invalid_profile_field',
          violation: parsed.error,
          message: parsed.error.message,
        });
      }
      changes = { ...changes, displayName: parsed.value };
    }
    if (input.locale !== undefined) {
      const parsed = parseLocale(input.locale);
      if (!parsed.ok) {
        return Result.err({
          kind: 'invalid_profile_field',
          violation: parsed.error,
          message: parsed.error.message,
        });
      }
      changes = { ...changes, locale: parsed.value };
    }
    if (changes.displayName === undefined && changes.locale === undefined) {
      return Result.err({
        kind: 'no_approved_field_changes',
        message:
          'nothing to update — the approved subject-editable fields are displayName and locale',
      });
    }

    try {
      const updated = await this.profiles.updateOwnFields(principal.value, changes);
      if (updated === null) {
        return Result.err({
          kind: 'profile_not_found',
          message: 'no profile exists for the authenticated principal in their tenant',
        });
      }
      return Result.ok(updated);
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `profile update failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
