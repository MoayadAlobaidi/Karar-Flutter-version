/**
 * TenancySelfApiModule — the SELF-scoped tenancy surface, mounted separately
 * from TenancyApiModule on purpose.
 *
 * The two differ in their principal requirement, which is the whole point:
 * TenancyApiModule's routes act inside a BOUND tenant, this one's act before
 * (or across) any binding. Keeping them apart means a composition cannot
 * accidentally hand the tenant-bound principal source to a read that must see
 * every tenant the caller belongs to, nor mount the self read with the
 * invitation surface's kill-switch gate, which does not apply to it.
 *
 * The composition root constructs ListOwnMemberships over the Prisma
 * membership repository and binds the identity-backed principal source, then
 * imports `TenancySelfApiModule.register(...)`. Ordinary NestJS composition —
 * no dynamic loading (ADR-0016).
 */

import { Module, type DynamicModule } from '@nestjs/common';

import {
  TENANCY_SELF_PRINCIPAL_SOURCE,
  type TenancySelfPrincipalSource,
} from './http/principal-source.js';
import {
  TENANCY_SELF_USE_CASES,
  OwnMembershipsController,
  type TenancySelfUseCases,
} from './http/own-memberships.controller.js';

export interface TenancySelfApiModuleOptions {
  readonly useCases: TenancySelfUseCases;
  readonly principalSource: TenancySelfPrincipalSource;
}

@Module({})
export class TenancySelfApiModule {
  static register(options: TenancySelfApiModuleOptions): DynamicModule {
    return {
      module: TenancySelfApiModule,
      controllers: [OwnMembershipsController],
      providers: [
        { provide: TENANCY_SELF_USE_CASES, useValue: options.useCases },
        { provide: TENANCY_SELF_PRINCIPAL_SOURCE, useValue: options.principalSource },
      ],
    };
  }
}
