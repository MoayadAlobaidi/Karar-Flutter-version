/**
 * AuthorizationModule — the NestJS wiring surface of the authorization
 * module. It deliberately registers NO controllers: Phase 3 exposes no role
 * administration HTTP surface (no cross-tenant platform-admin APIs; grants
 * and revocations run through the AssignRole/RevokeRole use cases from seeds
 * and tests until the Phase 8 control plane). What it provides — and exports
 * — are the two DI tokens the `requirePermission(...)` guard resolves, so
 * any module's controllers can put the guard on a route once the composition
 * root has registered this module.
 */

import { Module, type DynamicModule } from '@nestjs/common';

import type { PolicyService } from '../application/policy-service.js';
import {
  AUTHORIZATION_POLICY_SERVICE,
  AUTHORIZATION_PRINCIPAL_SOURCE,
  type AuthorizationPrincipalSource,
} from './http/permission.guard.js';

export interface AuthorizationModuleOptions {
  readonly policyService: PolicyService;
  readonly principalSource: AuthorizationPrincipalSource;
}

@Module({})
export class AuthorizationModule {
  static register(options: AuthorizationModuleOptions): DynamicModule {
    return {
      module: AuthorizationModule,
      providers: [
        { provide: AUTHORIZATION_POLICY_SERVICE, useValue: options.policyService },
        { provide: AUTHORIZATION_PRINCIPAL_SOURCE, useValue: options.principalSource },
      ],
      exports: [AUTHORIZATION_POLICY_SERVICE, AUTHORIZATION_PRINCIPAL_SOURCE],
    };
  }
}
