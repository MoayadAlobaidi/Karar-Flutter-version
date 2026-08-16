/**
 * Identity module configuration — the two server peppers, parsed with the
 * platform's typed schema from an INJECTED env object (the composition root
 * reads process.env exactly once, in the platform config loader's manner;
 * this module never dereferences it — config.ts convention).
 *
 * Both peppers are SecretValue: never logged, never serialized, unwrapped
 * only inside the digester. Local development has fixed placeholders; every
 * other environment must provide real values or the process refuses to boot.
 */

import {
  ConfigurationError,
  field,
  parseSchema,
  secret,
  type KararEnv,
  type SecretValue,
} from '@karar/platform/dist/config/index.js';

export interface IdentityConfig {
  readonly env: KararEnv;
  /** HMAC pepper for verification codes and reset tokens. */
  readonly verificationPepper: SecretValue;
  /** HMAC pepper for IP digests and rate-limit subject keys. */
  readonly digestPepper: SecretValue;
}

export const VERIFICATION_PEPPER_ENV_VAR = 'KARAR_VERIFICATION_PEPPER';
export const DIGEST_PEPPER_ENV_VAR = 'KARAR_DIGEST_PEPPER';

const LOCAL_ONLY_VERIFICATION_PEPPER = 'karar_local_dev_verification_pepper';
const LOCAL_ONLY_DIGEST_PEPPER = 'karar_local_dev_digest_pepper';

export function loadIdentityConfig(
  env: KararEnv,
  source: Readonly<Record<string, string | undefined>>,
): IdentityConfig {
  const isLocal = env === 'local';
  const outcome = parseSchema(
    {
      verificationPepper: field(
        VERIFICATION_PEPPER_ENV_VAR,
        secret({ minLength: 16, ...(isLocal ? { default: LOCAL_ONLY_VERIFICATION_PEPPER } : {}) }),
      ),
      digestPepper: field(
        DIGEST_PEPPER_ENV_VAR,
        secret({ minLength: 16, ...(isLocal ? { default: LOCAL_ONLY_DIGEST_PEPPER } : {}) }),
      ),
    },
    source,
    'identity.',
  );
  if (!outcome.ok) {
    throw new ConfigurationError(outcome.issues);
  }
  return Object.freeze({ env, ...outcome.value });
}
