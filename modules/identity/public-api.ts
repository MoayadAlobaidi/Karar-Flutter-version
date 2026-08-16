/**
 * The identity module's only legal import surface (architecture test 3).
 *
 * Exported: the NestJS module + controllers (the composition root wires
 * them), the runtime factory and its option types, the identity config
 * loader, the local-only key provider, and the outcome/principal types
 * other modules legitimately consume. Deliberately absent: repositories,
 * crypto adapters, and every internal port implementation — infrastructure
 * is wired by the composition root through `createIdentityRuntime`, never
 * imported across modules.
 */

// Presentation — module + controllers for the composition root.
export {
  IdentityApiModule,
  type IdentityApiModuleOptions,
} from './presentation/http/identity-api.module.js';
export { AuthController } from './presentation/http/auth.controller.js';
export { PasswordController } from './presentation/http/password.controller.js';
export { MfaController } from './presentation/http/mfa.controller.js';
export { SessionsController } from './presentation/http/sessions.controller.js';
export {
  AccessTokenGuard,
  principalOf,
  type RequestWithPrincipal,
} from './presentation/http/access-token.guard.js';

// Composition.
export {
  createIdentityRuntime,
  type IdentityRuntime,
  type IdentityRuntimeOptions,
  type IdentityUseCases,
} from './infrastructure/composition/create-identity-runtime.js';
export {
  DIGEST_PEPPER_ENV_VAR,
  VERIFICATION_PEPPER_ENV_VAR,
  loadIdentityConfig,
  type IdentityConfig,
} from './infrastructure/config/identity-config.js';
export {
  LocalDevKeyEnvironmentError,
  LocalDevKeyProvider,
} from './infrastructure/providers/local-dev-key-provider.js';

// Contract types consumers may need.
export type { AuthenticatedPrincipal } from './application/use-cases/authenticate-request.js';
export type { IssuedSession } from './application/session-issuer.js';
export type { ClientContext } from './application/identity-deps.js';
export type { TokenKeyProvider } from './application/ports/crypto-ports.js';
export { DEFAULT_IDENTITY_POLICY, type IdentityPolicy } from './domain/identity-policy.js';
export type { SecurityEventType } from './domain/security-event.js';
