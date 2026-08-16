/**
 * BootstrapApiModule — the NestJS surface of the bootstrap module. The
 * composition root (apps/api) constructs the use cases over their ports
 * (tenancy's resolution/switch use cases, identity's bind/revoke use cases,
 * the jurisdiction/operating-entity/PolicyPack/capability resolvers, the
 * audit trail over RecordAuditEvent) and the identity-backed
 * BootstrapPrincipalSource, then imports `BootstrapApiModule.register(...)`.
 * Ordinary NestJS composition — no dynamic loading (ADR-0016).
 */

import { Module, type DynamicModule } from '@nestjs/common';

import {
  BOOTSTRAP_PRINCIPAL_SOURCE,
  type BootstrapPrincipalSource,
} from './http/principal-source.js';
import {
  BOOTSTRAP_USE_CASES,
  BootstrapController,
  type BootstrapUseCases,
} from './http/bootstrap.controller.js';

export interface BootstrapApiModuleOptions {
  readonly useCases: BootstrapUseCases;
  readonly principalSource: BootstrapPrincipalSource;
}

@Module({})
export class BootstrapApiModule {
  static register(options: BootstrapApiModuleOptions): DynamicModule {
    return {
      module: BootstrapApiModule,
      controllers: [BootstrapController],
      providers: [
        { provide: BOOTSTRAP_USE_CASES, useValue: options.useCases },
        { provide: BOOTSTRAP_PRINCIPAL_SOURCE, useValue: options.principalSource },
      ],
    };
  }
}
