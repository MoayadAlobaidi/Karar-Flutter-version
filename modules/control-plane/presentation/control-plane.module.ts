/**
 * ControlPlaneModule — the NestJS wiring surface of the Phase 3 kill-switch
 * slice. It deliberately registers NO controllers: there is no kill-switch
 * HTTP surface this phase (the control-plane UI is Phase 8; operate runs
 * through the OperateKillSwitch use case from runbooks and tests). What it
 * provides — and exports — is the KILL_SWITCH_PORT token the
 * `RequireOperationAllowed(...)` guard resolves, so identity and tenancy
 * controllers can put the guard on their registration/login/refresh/
 * invitation routes once the composition root has registered this module.
 */

import { Module, type DynamicModule } from '@nestjs/common';

import type { KillSwitchPort } from '../application/kill-switch-port.js';
import { KILL_SWITCH_PORT } from './http/kill-switch.guard.js';

export interface ControlPlaneModuleOptions {
  readonly killSwitchPort: KillSwitchPort;
}

@Module({})
export class ControlPlaneModule {
  static register(options: ControlPlaneModuleOptions): DynamicModule {
    return {
      module: ControlPlaneModule,
      providers: [{ provide: KILL_SWITCH_PORT, useValue: options.killSwitchPort }],
      exports: [KILL_SWITCH_PORT],
    };
  }
}
