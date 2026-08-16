/**
 * IdentityApiModule — the NestJS module the composition root imports
 * (backend.md §3: wiring is ordinary module imports; the lead wires this
 * into apps/api's AppModule). The runtime (repositories, crypto, use cases)
 * is constructed OUTSIDE Nest by `createIdentityRuntime` so both entrypoints
 * and the tests share one composition path; this module only binds it to
 * transport.
 */

import { Module, type DynamicModule } from '@nestjs/common';
import type { TrustedProxyPolicy } from '@karar/platform/dist/http/index.js';

import type { IdentityRuntime } from '../../infrastructure/composition/create-identity-runtime.js';
import { IDENTITY_OPERATION_GATE, type OperationGate } from './operation-gate.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController } from './auth.controller.js';
import {
  IDENTITY_EDGE_CONTEXT,
  IDENTITY_USE_CASES,
  IdentityEdgeContext,
} from './identity-di.js';
import { MfaController } from './mfa.controller.js';
import { PasswordController } from './password.controller.js';
import { SessionsController } from './sessions.controller.js';

export interface IdentityApiModuleOptions {
  readonly runtime: IdentityRuntime;
  /** From platform http: parsed KARAR_TRUSTED_PROXIES (default: trust nothing). */
  readonly trustedProxies: TrustedProxyPolicy;
  /**
   * The kill-switch gate (identity's OWN port; the composition root binds the
   * control-plane's CheckKillSwitch). The registration/login/refresh routes
   * carry `RequireOperationAllowed(...)` guards that resolve it. Required so
   * a composition cannot silently mount these routes unguarded.
   */
  readonly killSwitches: OperationGate;
}

@Module({})
export class IdentityApiModule {
  static forRoot(options: IdentityApiModuleOptions): DynamicModule {
    return {
      module: IdentityApiModule,
      controllers: [AuthController, PasswordController, MfaController, SessionsController],
      providers: [
        { provide: IDENTITY_USE_CASES, useValue: options.runtime.useCases },
        {
          provide: IDENTITY_EDGE_CONTEXT,
          useValue: new IdentityEdgeContext(options.trustedProxies, options.runtime.deps.digester),
        },
        { provide: IDENTITY_OPERATION_GATE, useValue: options.killSwitches },
        AccessTokenGuard,
      ],
      exports: [IDENTITY_USE_CASES],
    };
  }
}
