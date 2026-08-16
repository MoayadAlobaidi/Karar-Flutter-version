/**
 * ConsentApiModule — the NestJS module the composition root (apps/api)
 * mounts to expose the §49 consent endpoints. The module takes the WIRED
 * use cases as input: construction of repositories, the Prisma handle, the
 * audit trail, and the PolicyService belongs to the composition root, so no
 * framework or vendor choice leaks out of this module's boundaries.
 *
 * Deliberately absent: an entity-admin module. Entity administration is a
 * Super Admin surface and mounts behind the control-plane gateway when that
 * phase lands (ADR-0021; decision recorded in
 * modules/operating-entity/MODULE.md).
 */

import { Module, type DynamicModule } from '@nestjs/common';

import {
  CONSENT_ENDPOINT_USE_CASES,
  ConsentController,
  type ConsentEndpointUseCases,
} from './consent.controller.js';

@Module({})
export class ConsentApiModule {
  static register(useCases: ConsentEndpointUseCases): DynamicModule {
    return {
      module: ConsentApiModule,
      controllers: [ConsentController],
      providers: [{ provide: CONSENT_ENDPOINT_USE_CASES, useValue: useCases }],
    };
  }
}
