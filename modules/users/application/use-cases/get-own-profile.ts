/**
 * GetOwnProfile — the acting principal reads their own profile. Tenant and
 * user identity come exclusively from the passed principal (resolved at the
 * edge from server-side state); beneath the repository, RLS restricts the
 * read to the principal's own tenant regardless of what this code does.
 */

import { Result } from '@karar/shared-kernel';

import { requirePrincipal, type PrincipalActor } from '../principal.js';
import type { GetOwnProfileError } from '../errors.js';
import type { UserProfileRepository } from '../ports/user-profile-repository.js';
import type { UserProfile } from '../../domain/user-profile.js';

export class GetOwnProfile {
  constructor(private readonly profiles: UserProfileRepository) {}

  async execute(actor: PrincipalActor): Promise<Result<UserProfile, GetOwnProfileError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) {
      return principal;
    }
    try {
      const profile = await this.profiles.findOwn(principal.value);
      if (profile === null) {
        return Result.err({
          kind: 'profile_not_found',
          message: 'no profile exists for the authenticated principal in their tenant',
        });
      }
      return Result.ok(profile);
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `profile read failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
