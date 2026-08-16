/**
 * TenancyApiModule — the NestJS surface of the tenancy module. The
 * composition root (apps/api) constructs the use cases over their
 * infrastructure (Prisma repositories on the app-role handle, the sha256
 * token source, the audit trail over RecordAuditEvent, identity's redeemer
 * email source, the authorization module's PolicyService) and the identity
 * module's TenancyPrincipalSource, then imports
 * `TenancyApiModule.register(...)`. Ordinary NestJS composition — no dynamic
 * loading (ADR-0016).
 */

import { Module, type DynamicModule } from '@nestjs/common';

import {
  TENANCY_PRINCIPAL_SOURCE,
  type TenancyPrincipalSource,
} from './http/principal-source.js';
import { TENANCY_OPERATION_GATE, type OperationGate } from './http/operation-gate.js';
import {
  TENANCY_USE_CASES,
  TenancyController,
  type TenancyUseCases,
} from './http/tenancy.controller.js';

export interface TenancyApiModuleOptions {
  readonly useCases: TenancyUseCases;
  readonly principalSource: TenancyPrincipalSource;
  /**
   * The kill-switch gate (tenancy's OWN port; the composition root binds the
   * control-plane's CheckKillSwitch). The invitation routes carry
   * `RequireOperationAllowed('TENANT_INVITATIONS')` guards that resolve it.
   * Required so a composition cannot silently mount them unguarded.
   */
  readonly killSwitches: OperationGate;
}

@Module({})
export class TenancyApiModule {
  static register(options: TenancyApiModuleOptions): DynamicModule {
    return {
      module: TenancyApiModule,
      controllers: [TenancyController],
      providers: [
        { provide: TENANCY_USE_CASES, useValue: options.useCases },
        { provide: TENANCY_PRINCIPAL_SOURCE, useValue: options.principalSource },
        { provide: TENANCY_OPERATION_GATE, useValue: options.killSwitches },
      ],
    };
  }
}
