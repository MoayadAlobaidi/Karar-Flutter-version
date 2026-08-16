/**
 * The compile-time permission and role catalogue — the code mirror of
 * migrations 0050/0051 (an integration test asserts DB seed == this file, so
 * the two cannot drift silently). Deny-by-default needs a CLOSED universe:
 * every grantable permission and role is enumerated here, named
 * `<capability>.<resource>.<action>` (access-control.md §2), and there are
 * NO wildcards — `validateCatalogue` refuses '*' and any name outside the
 * grammar, structurally.
 *
 * Deliberately absent, restated where the catalogue lives: no
 * `amanat.content.read` for any role (not restricted — ABSENT); no
 * permission returns credential material; no permission grants a
 * cross-tenant consumer-data read. A new permission or role is a reviewed
 * forward migration PLUS the matching change here.
 */

export const PERMISSION_NAME_GRAMMAR = /^[a-z][a-z_]*\.[a-z][a-z_]*\.[a-z][a-z_]*$/;

export interface PermissionDefinition {
  readonly name: string;
  readonly capability: string;
  readonly description: string;
}

export const PERMISSION_CATALOGUE = [
  {
    name: 'identity.session.revoke',
    capability: 'identity',
    description:
      "Revoke another principal's sessions (admin mechanism; modules/identity/MODULE.md)",
  },
  {
    name: 'identity.mfa.reset',
    capability: 'identity',
    description:
      "Reset another principal's MFA enrolment (admin mechanism; modules/identity/MODULE.md)",
  },
  {
    name: 'users.profile.read',
    capability: 'users',
    description:
      'Read a customer profile as staff — every read audited, including empty results (modules/users/MODULE.md)',
  },
  {
    name: 'users.status.update',
    capability: 'users',
    description: 'Change a customer account status as staff (modules/users/MODULE.md)',
  },
  {
    name: 'tenancy.member.read',
    capability: 'tenancy',
    description: "List the members of one's own tenant (modules/tenancy/MODULE.md)",
  },
  {
    name: 'tenancy.invitation.create',
    capability: 'tenancy',
    description: "Invite an email into one's own tenant (modules/tenancy/MODULE.md)",
  },
  {
    name: 'tenancy.invitation.revoke',
    capability: 'tenancy',
    description: "Revoke an open invitation in one's own tenant (modules/tenancy/MODULE.md)",
  },
  {
    name: 'entity.entity.manage',
    capability: 'entity',
    description:
      'Maintain the operating-entity register: entities, jurisdiction permissions, licences, bindings (modules/operating-entity/MODULE.md)',
  },
  {
    name: 'entity.migration.approve',
    capability: 'entity',
    description:
      'Approve and progress an entity-binding migration (modules/operating-entity/MODULE.md)',
  },
  {
    name: 'consent.document.publish',
    capability: 'consent',
    description:
      'Create, classify, and publish legal-document versions (modules/consent/MODULE.md)',
  },
  {
    name: 'consent.status.read',
    capability: 'consent',
    description: "Read a subject's consent status as staff — audited (modules/consent/MODULE.md)",
  },
  {
    name: 'controlplane.killswitch.operate',
    capability: 'controlplane',
    description:
      'Activate or deactivate a restrict-only kill switch (modules/control-plane/MODULE.md)',
  },
  {
    name: 'authorization.role.assign',
    capability: 'authorization',
    description:
      'Grant a catalogue role to a principal (modules/authorization/MODULE.md; PLATFORM_ADMIN delegation rule applies)',
  },
  {
    name: 'authorization.role.revoke',
    capability: 'authorization',
    description: "Revoke a principal's role assignment (modules/authorization/MODULE.md)",
  },
] as const satisfies readonly PermissionDefinition[];

export type PermissionName = (typeof PERMISSION_CATALOGUE)[number]['name'];

/** Where an assignment of the role may bind (access-control.md §3). */
export type RoleScope = 'PLATFORM' | 'TENANT' | 'BOTH';

export interface RoleDefinition {
  readonly id: string;
  readonly scope: RoleScope;
  readonly description: string;
}

export const ROLE_CATALOGUE = [
  {
    id: 'USER',
    scope: 'PLATFORM',
    description:
      'Consumer principal; owns their own data. Own-data authority comes from identity + RLS, never from an RBAC grant.',
  },
  {
    id: 'TENANT_MEMBER',
    scope: 'TENANT',
    description: 'Member of a partner tenant; membership semantics live in tenant_members.',
  },
  {
    id: 'TENANT_ADMIN',
    scope: 'TENANT',
    description: 'Administers their tenant only; RLS-enforced; never platform authority.',
  },
  {
    id: 'SUPPORT',
    scope: 'PLATFORM',
    description:
      'Reads customer metadata per permission; every read audited, including reads returning nothing.',
  },
  {
    id: 'OPERATOR',
    scope: 'PLATFORM',
    description: 'Availability, kill switches, provider enablement — restrict-only authority.',
  },
  {
    id: 'SECURITY',
    scope: 'PLATFORM',
    description:
      'Audit and security events; no content access. Holds nothing until those read paths exist.',
  },
  {
    id: 'PLATFORM_ADMIN',
    scope: 'PLATFORM',
    description:
      'Role and entity administration; grantable only by a PLATFORM_ADMIN peer (delegation rule).',
  },
  {
    id: 'DISCLOSURE_APPROVER',
    scope: 'PLATFORM',
    description:
      'Approves disclosure cases without seeing sealed content; amanat is future, so it holds nothing yet.',
  },
] as const satisfies readonly RoleDefinition[];

export type RoleId = (typeof ROLE_CATALOGUE)[number]['id'];

/**
 * The reviewed role → permission mapping (deny-by-default: absence denies).
 * Roles mapping to [] hold NOTHING yet — a design statement, not an
 * omission: USER and TENANT_MEMBER carry no staff permission by definition;
 * SECURITY's read paths do not exist in Phase 3; DISCLOSURE_APPROVER's
 * capability (amanat) is future — and even then, amanat.content.read will
 * never exist for any role.
 */
export const ROLE_PERMISSION_GRANTS: Readonly<Record<RoleId, readonly PermissionName[]>> = {
  USER: [],
  TENANT_MEMBER: [],
  TENANT_ADMIN: ['tenancy.member.read', 'tenancy.invitation.create', 'tenancy.invitation.revoke'],
  SUPPORT: ['users.profile.read', 'consent.status.read'],
  OPERATOR: ['controlplane.killswitch.operate'],
  SECURITY: [],
  PLATFORM_ADMIN: [
    'authorization.role.assign',
    'authorization.role.revoke',
    'entity.entity.manage',
    'entity.migration.approve',
    'identity.session.revoke',
    'identity.mfa.reset',
    'users.status.update',
    'consent.document.publish',
  ],
  DISCLOSURE_APPROVER: [],
};

export function isPermissionName(value: string): value is PermissionName {
  return PERMISSION_CATALOGUE.some((permission) => permission.name === value);
}

export function isRoleId(value: string): value is RoleId {
  return ROLE_CATALOGUE.some((role) => role.id === value);
}

export function roleDefinition(id: RoleId): RoleDefinition {
  const role = ROLE_CATALOGUE.find((candidate) => candidate.id === id);
  if (role === undefined) {
    throw new CatalogueViolationError(`role '${id}' is not in the catalogue`);
  }
  return role;
}

export function permissionsGrantedTo(role: RoleId): readonly PermissionName[] {
  return ROLE_PERMISSION_GRANTS[role];
}

/** May an assignment of `scope`-scoped role bind with (`TENANT`) or without (`PLATFORM`) a tenant? */
export function roleScopeAdmitsBinding(scope: RoleScope, tenantBound: boolean): boolean {
  switch (scope) {
    case 'PLATFORM':
      return !tenantBound;
    case 'TENANT':
      return tenantBound;
    case 'BOTH':
      return true;
  }
}

/** A malformed catalogue is a defect of this module, not an outcome — it throws. */
export class CatalogueViolationError extends Error {
  override readonly name = 'CatalogueViolationError';
}

/**
 * Structural soundness of the closed world: every permission name obeys the
 * grammar (which excludes '*' by construction), carries its own capability
 * prefix, and is unique; every role id is UPPER_SNAKE and unique; every
 * grant references a catalogue permission. Called by the PolicyService
 * constructor — a service over a broken catalogue must not start.
 */
export function validateCatalogue(): void {
  const seenPermissions = new Set<string>();
  for (const permission of PERMISSION_CATALOGUE) {
    if (permission.name.includes('*')) {
      throw new CatalogueViolationError(
        `permission '${permission.name}' contains a wildcard — deny-by-default needs an enumerable universe`,
      );
    }
    if (!PERMISSION_NAME_GRAMMAR.test(permission.name)) {
      throw new CatalogueViolationError(
        `permission '${permission.name}' violates the <capability>.<resource>.<action> grammar`,
      );
    }
    if (permission.capability !== permission.name.split('.')[0]) {
      throw new CatalogueViolationError(
        `permission '${permission.name}' declares capability '${permission.capability}', not its own prefix`,
      );
    }
    if (seenPermissions.has(permission.name)) {
      throw new CatalogueViolationError(`permission '${permission.name}' is duplicated`);
    }
    seenPermissions.add(permission.name);
  }

  const seenRoles = new Set<string>();
  for (const role of ROLE_CATALOGUE) {
    if (!/^[A-Z][A-Z_]*$/.test(role.id)) {
      throw new CatalogueViolationError(`role '${role.id}' violates the UPPER_SNAKE grammar`);
    }
    if (seenRoles.has(role.id)) {
      throw new CatalogueViolationError(`role '${role.id}' is duplicated`);
    }
    seenRoles.add(role.id);
  }

  for (const [role, grants] of Object.entries(ROLE_PERMISSION_GRANTS)) {
    if (!seenRoles.has(role)) {
      throw new CatalogueViolationError(`grants declared for unknown role '${role}'`);
    }
    for (const grant of grants) {
      if (!seenPermissions.has(grant)) {
        throw new CatalogueViolationError(
          `role '${role}' is granted '${grant}', which is not a catalogue permission`,
        );
      }
    }
  }
}
