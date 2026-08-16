/**
 * Composition helper: builds the full IdentityDependencies bundle and the
 * use-case set from platform primitives. The composition root (apps/api
 * main.ts — wired by the phase lead) constructs the platform pieces (Prisma
 * handle on the app role, audit use case, notification port, rate limiter,
 * encryption provider) and calls `createIdentityRuntime`; tests call it with
 * local/in-memory equivalents. Nothing in here reads the environment.
 */

import type { Clock } from '@karar/shared-kernel';
import type { RecordAuditEvent } from '@karar/audit';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import type { EncryptionProvider } from '@karar/platform/dist/keys/index.js';
import type { NotificationPort } from '@karar/platform/dist/notifications/index.js';
import {
  RateLimitKeyHasher,
  RateLimitService,
  type RateLimiter,
} from '@karar/platform/dist/ratelimit/index.js';

import { DEFAULT_IDENTITY_POLICY, type IdentityPolicy } from '../../domain/identity-policy.js';
import type { IdentityDependencies } from '../../application/identity-deps.js';
import { AuthenticateRequest } from '../../application/use-cases/authenticate-request.js';
import { DisableAccount, EnableAccount } from '../../application/use-cases/account-administration.js';
import { Login } from '../../application/use-cases/login.js';
import {
  ChangePassword,
  ForgotPassword,
  ResetPassword,
} from '../../application/use-cases/password-recovery.js';
import { RefreshSession } from '../../application/use-cases/refresh-session.js';
import { RegisterAccount } from '../../application/use-cases/register-account.js';
import {
  ConfirmMfa,
  DisableMfa,
  EnrollMfa,
  VerifyMfaChallenge,
} from '../../application/use-cases/mfa.js';
import {
  ListSessions,
  Logout,
  RevokeOtherSessions,
  RevokeSession,
} from '../../application/use-cases/session-lifecycle.js';
import {
  BindSessionTenant,
  RebindSessionTenant,
} from '../../application/use-cases/session-tenant-binding.js';
import { ResendVerification, VerifyEmail } from '../../application/use-cases/verify-email.js';
import { Argon2PasswordHasher } from '../crypto/argon2-password-hasher.js';
import { JoseTokenSigner } from '../crypto/jose-token-signer.js';
import { NodeCredentialDigester } from '../crypto/node-credential-digester.js';
import { NodeSecretSource } from '../crypto/node-secret-source.js';
import { OtplibTotpService } from '../crypto/otplib-totp-service.js';
import { IdentityPrismaScope } from '../persistence/prisma-scope.js';
import {
  PrismaAccountStore,
  PrismaResetRequestStore,
  PrismaVerificationStore,
} from '../persistence/prisma-identity-store.js';
import { PrismaMfaStore } from '../persistence/prisma-mfa-store.js';
import { PrismaSecurityEventStore } from '../persistence/prisma-security-event-store.js';
import { PrismaSessionStore } from '../persistence/prisma-session-store.js';
import { PlatformMfaSecretCipher } from '../providers/platform-mfa-secret-cipher.js';
import type { IdentityConfig } from '../config/identity-config.js';
import type { TokenKeyProvider } from '../../application/ports/crypto-ports.js';

export interface IdentityRuntimeOptions {
  readonly config: IdentityConfig;
  readonly prisma: PrismaHandle;
  readonly recordAudit: RecordAuditEvent;
  readonly notifications: NotificationPort;
  readonly encryption: EncryptionProvider;
  /** The distributed limiter; tests may pass an in-process one. */
  readonly rateLimiter: RateLimiter;
  readonly tokenKeys: TokenKeyProvider;
  readonly clock: Clock;
  readonly policy?: Partial<IdentityPolicy>;
}

export interface IdentityUseCases {
  readonly registerAccount: RegisterAccount;
  readonly verifyEmail: VerifyEmail;
  readonly resendVerification: ResendVerification;
  readonly login: Login;
  readonly refreshSession: RefreshSession;
  readonly authenticateRequest: AuthenticateRequest;
  readonly listSessions: ListSessions;
  readonly revokeSession: RevokeSession;
  readonly revokeOtherSessions: RevokeOtherSessions;
  readonly logout: Logout;
  readonly bindSessionTenant: BindSessionTenant;
  readonly rebindSessionTenant: RebindSessionTenant;
  readonly forgotPassword: ForgotPassword;
  readonly resetPassword: ResetPassword;
  readonly changePassword: ChangePassword;
  readonly enrollMfa: EnrollMfa;
  readonly confirmMfa: ConfirmMfa;
  readonly verifyMfaChallenge: VerifyMfaChallenge;
  readonly disableMfa: DisableMfa;
  readonly disableAccount: DisableAccount;
  readonly enableAccount: EnableAccount;
}

export interface IdentityRuntime {
  readonly deps: IdentityDependencies;
  readonly useCases: IdentityUseCases;
}

export function createIdentityRuntime(options: IdentityRuntimeOptions): IdentityRuntime {
  const scope = new IdentityPrismaScope(options.prisma);
  const policy: IdentityPolicy = Object.freeze({
    ...DEFAULT_IDENTITY_POLICY,
    ...(options.policy ?? {}),
  });

  const deps: IdentityDependencies = {
    accounts: new PrismaAccountStore(scope),
    verifications: new PrismaVerificationStore(scope),
    resets: new PrismaResetRequestStore(scope),
    sessions: new PrismaSessionStore(scope),
    mfa: new PrismaMfaStore(scope),
    securityEvents: new PrismaSecurityEventStore(scope),
    passwordHasher: new Argon2PasswordHasher(),
    tokenSigner: new JoseTokenSigner({
      keys: options.tokenKeys,
      accessTokenTtlMs: policy.accessTokenTtlMs,
      challengeTokenTtlMs: policy.challengeTokenTtlMs,
    }),
    digester: new NodeCredentialDigester(
      options.config.verificationPepper,
      options.config.digestPepper,
    ),
    secretSource: new NodeSecretSource(),
    totp: new OtplibTotpService(),
    mfaCipher: new PlatformMfaSecretCipher(options.encryption),
    notifications: options.notifications,
    recordAudit: options.recordAudit,
    rateLimits: new RateLimitService({ primary: options.rateLimiter }),
    rateLimitKeys: new RateLimitKeyHasher(options.config.digestPepper),
    clock: options.clock,
    policy,
    environment: options.config.env,
  };

  const registerAccount = new RegisterAccount(deps);
  const useCases: IdentityUseCases = {
    registerAccount,
    verifyEmail: new VerifyEmail(deps),
    resendVerification: new ResendVerification(deps, registerAccount),
    login: new Login(deps),
    refreshSession: new RefreshSession(deps),
    authenticateRequest: new AuthenticateRequest(deps),
    listSessions: new ListSessions(deps),
    revokeSession: new RevokeSession(deps),
    revokeOtherSessions: new RevokeOtherSessions(deps),
    logout: new Logout(deps),
    bindSessionTenant: new BindSessionTenant(deps),
    rebindSessionTenant: new RebindSessionTenant(deps),
    forgotPassword: new ForgotPassword(deps),
    resetPassword: new ResetPassword(deps),
    changePassword: new ChangePassword(deps),
    enrollMfa: new EnrollMfa(deps),
    confirmMfa: new ConfirmMfa(deps),
    verifyMfaChallenge: new VerifyMfaChallenge(deps),
    disableMfa: new DisableMfa(deps),
    disableAccount: new DisableAccount(deps),
    enableAccount: new EnableAccount(deps),
  };

  return { deps, useCases };
}
