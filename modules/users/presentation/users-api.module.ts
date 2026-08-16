/**
 * UsersApiModule — the NestJS surface of the users module. The composition
 * root (apps/api) constructs the use cases over their infrastructure
 * (PrismaUserProfileRepository on the app-role handle, the audit trail over
 * RecordAuditEvent, a host-clock adapter) and the identity module's
 * PrincipalSource, then imports `UsersApiModule.register(...)`. This module
 * performs no wiring of its own — ordinary NestJS composition, no dynamic
 * loading (ADR-0016).
 */

import { Module, type DynamicModule } from '@nestjs/common';

import { USERS_PRINCIPAL_SOURCE, type PrincipalSource } from './http/principal-source.js';
import { USERS_USE_CASES, UsersController, type UsersUseCases } from './http/users.controller.js';

export interface UsersApiModuleOptions {
  readonly useCases: UsersUseCases;
  readonly principalSource: PrincipalSource;
}

@Module({})
export class UsersApiModule {
  static register(options: UsersApiModuleOptions): DynamicModule {
    return {
      module: UsersApiModule,
      controllers: [UsersController],
      providers: [
        { provide: USERS_USE_CASES, useValue: options.useCases },
        { provide: USERS_PRINCIPAL_SOURCE, useValue: options.principalSource },
      ],
    };
  }
}
