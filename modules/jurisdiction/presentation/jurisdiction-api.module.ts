/**
 * JurisdictionApiModule — the NestJS surface of the jurisdiction module,
 * carrying exactly one route (POST /jurisdiction/self-declaration). The
 * composition root constructs the use case over its ports and the
 * identity-backed principal source, then imports
 * `JurisdictionApiModule.register(...)`. Ordinary NestJS composition — no
 * dynamic loading (ADR-0016).
 *
 * Nothing else in this module is mounted, and nothing else should be: operator
 * assignment, verification, and PolicyPack activation are control-plane
 * surfaces (ADR-0021), and their permissions stay unseeded until it arrives.
 */

import { Module, type DynamicModule } from '@nestjs/common';

import {
  JURISDICTION_PRINCIPAL_SOURCE,
  type JurisdictionPrincipalSource,
} from './http/principal-source.js';
import {
  JURISDICTION_USE_CASES,
  JurisdictionController,
  type JurisdictionUseCases,
} from './http/jurisdiction.controller.js';

export interface JurisdictionApiModuleOptions {
  readonly useCases: JurisdictionUseCases;
  readonly principalSource: JurisdictionPrincipalSource;
  readonly clock: { now(): Date };
}

@Module({})
export class JurisdictionApiModule {
  static register(options: JurisdictionApiModuleOptions): DynamicModule {
    return {
      module: JurisdictionApiModule,
      controllers: [JurisdictionController],
      providers: [
        { provide: JURISDICTION_USE_CASES, useValue: options.useCases },
        { provide: JURISDICTION_PRINCIPAL_SOURCE, useValue: options.principalSource },
        { provide: 'karar.jurisdiction.clock', useValue: options.clock },
      ],
    };
  }
}
