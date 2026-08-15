// Key custody, key-management and encryption ports, key/version references,
// and the sealed-integrity canary contract (ADR-0017). Design-and-interfaces
// only in Phase 2: no cloud SDK, no production key material anywhere here.

export {
  InvalidKeyVersionRefError,
  keyRefOf,
  keyVersionRef,
  parseKeyRef,
  parseKeyVersionRef,
  versionOf,
  type KeyRef,
  type KeyVersionRef,
} from './refs.js';
export {
  KEY_CUSTODY_MODELS,
  type KeyCustodyModel,
  type KeyCustodyStrategy,
  type KeyRecoveryPolicy,
  type KeyRotationPolicy,
} from './custody.js';
export {
  KeyManagementError,
  type CiphertextEnvelope,
  type EncryptionProvider,
  type KeyDescriptor,
  type KeyManagementErrorKind,
  type KeyManagementProvider,
  type WrappedDek,
} from './ports.js';
export {
  CANARY_PLAINTEXT_PREFIX,
  CanaryPlaintextError,
  assertSyntheticCanaryPlaintext,
  integrityCanaryContract,
  type CanaryVerifyOutcome,
  type IntegrityCanaryContract,
} from './canary.js';
export { InMemoryTestEncryptionProvider } from './in-memory-test-encryption-provider.js';
