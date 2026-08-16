import { describe, expect, it } from 'vitest';

import {
  CatalogueViolationError,
  PERMISSION_CATALOGUE,
  PERMISSION_NAME_GRAMMAR,
  ROLE_CATALOGUE,
  ROLE_PERMISSION_GRANTS,
  isPermissionName,
  isRoleId,
  permissionsGrantedTo,
  roleScopeAdmitsBinding,
  validateCatalogue,
} from '../domain/catalogue.js';

// The catalogue is the closed world deny-by-default denies against
// (access-control.md §2). These tests pin its shape: the exact Phase 3
// names, the grammar (which structurally excludes wildcards), and the
// permissions-deliberately-absent discipline.

describe('permission catalogue', () => {
  it('holds exactly the fourteen Phase 3 permissions', () => {
    expect(PERMISSION_CATALOGUE.map((p) => p.name).sort()).toEqual(
      [
        'authorization.role.assign',
        'authorization.role.revoke',
        'consent.document.publish',
        'consent.status.read',
        'controlplane.killswitch.operate',
        'entity.entity.manage',
        'entity.migration.approve',
        'identity.mfa.reset',
        'identity.session.revoke',
        'tenancy.invitation.create',
        'tenancy.invitation.revoke',
        'tenancy.member.read',
        'users.profile.read',
        'users.status.update',
      ].sort(),
    );
  });

  it('every name obeys <capability>.<resource>.<action> and carries its own prefix', () => {
    for (const permission of PERMISSION_CATALOGUE) {
      expect(permission.name).toMatch(PERMISSION_NAME_GRAMMAR);
      expect(permission.capability).toBe(permission.name.split('.')[0]);
      expect(permission.description.length).toBeGreaterThan(0);
    }
  });

  it('contains NO wildcards, and the grammar rejects wildcard shapes', () => {
    for (const permission of PERMISSION_CATALOGUE) {
      expect(permission.name).not.toContain('*');
    }
    for (const candidate of ['*', '*.*.*', 'tenancy.*.*', 'tenancy.member.*', 'a.b.*']) {
      expect(PERMISSION_NAME_GRAMMAR.test(candidate)).toBe(false);
      expect(isPermissionName(candidate)).toBe(false);
    }
  });

  it('permissions-deliberately-absent: amanat.content.read does not exist and never resolves', () => {
    expect(isPermissionName('amanat.content.read')).toBe(false);
    for (const role of ROLE_CATALOGUE) {
      expect(ROLE_PERMISSION_GRANTS[role.id]).not.toContain('amanat.content.read');
    }
  });

  it('undocumented identity account permissions are absent until their surface exists', () => {
    expect(isPermissionName('identity.account.disable')).toBe(false);
    expect(isPermissionName('identity.account.enable')).toBe(false);
  });
});

describe('role catalogue', () => {
  it('holds exactly the eight roles with their scopes', () => {
    expect(
      ROLE_CATALOGUE.map((role) => [role.id, role.scope])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['DISCLOSURE_APPROVER', 'PLATFORM'],
      ['OPERATOR', 'PLATFORM'],
      ['PLATFORM_ADMIN', 'PLATFORM'],
      ['SECURITY', 'PLATFORM'],
      ['SUPPORT', 'PLATFORM'],
      ['TENANT_ADMIN', 'TENANT'],
      ['TENANT_MEMBER', 'TENANT'],
      ['USER', 'PLATFORM'],
    ]);
  });

  it('deny-by-default mapping: only the documented grants; four roles hold nothing', () => {
    expect([...permissionsGrantedTo('TENANT_ADMIN')].sort()).toEqual([
      'tenancy.invitation.create',
      'tenancy.invitation.revoke',
      'tenancy.member.read',
    ]);
    expect([...permissionsGrantedTo('SUPPORT')].sort()).toEqual([
      'consent.status.read',
      'users.profile.read',
    ]);
    expect(permissionsGrantedTo('OPERATOR')).toEqual(['controlplane.killswitch.operate']);
    expect([...permissionsGrantedTo('PLATFORM_ADMIN')].sort()).toEqual([
      'authorization.role.assign',
      'authorization.role.revoke',
      'consent.document.publish',
      'entity.entity.manage',
      'entity.migration.approve',
      'identity.mfa.reset',
      'identity.session.revoke',
      'users.status.update',
    ]);
    for (const empty of ['USER', 'TENANT_MEMBER', 'SECURITY', 'DISCLOSURE_APPROVER'] as const) {
      expect(permissionsGrantedTo(empty)).toEqual([]);
    }
  });

  it('tenant roles never hold a platform-administration permission', () => {
    const platformOnly = [
      'authorization.role.assign',
      'authorization.role.revoke',
      'entity.entity.manage',
      'users.status.update',
      'controlplane.killswitch.operate',
    ];
    for (const role of ROLE_CATALOGUE.filter((r) => r.scope === 'TENANT')) {
      for (const permission of platformOnly) {
        expect(ROLE_PERMISSION_GRANTS[role.id]).not.toContain(permission);
      }
    }
  });

  it('scope binding rules: TENANT needs a tenant, PLATFORM refuses one, BOTH admits either', () => {
    expect(roleScopeAdmitsBinding('TENANT', true)).toBe(true);
    expect(roleScopeAdmitsBinding('TENANT', false)).toBe(false);
    expect(roleScopeAdmitsBinding('PLATFORM', false)).toBe(true);
    expect(roleScopeAdmitsBinding('PLATFORM', true)).toBe(false);
    expect(roleScopeAdmitsBinding('BOTH', true)).toBe(true);
    expect(roleScopeAdmitsBinding('BOTH', false)).toBe(true);
  });

  it('isRoleId is the closed check', () => {
    expect(isRoleId('PLATFORM_ADMIN')).toBe(true);
    expect(isRoleId('SUPER_ADMIN')).toBe(false);
    expect(isRoleId('*')).toBe(false);
  });
});

describe('validateCatalogue', () => {
  it('passes on the shipped catalogue', () => {
    expect(() => validateCatalogue()).not.toThrow();
  });

  it('exports the violation error type for sabotage tests downstream', () => {
    expect(new CatalogueViolationError('x')).toBeInstanceOf(Error);
  });
});
