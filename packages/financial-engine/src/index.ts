// Phase 1 placeholder: establishes the package boundary and the build.
// The engine itself arrives in Phase 2 (docs/architecture/financial-engine.md).
// May import @karar/shared-kernel and nothing else.
import type { Currency, Money } from '@karar/shared-kernel';

/** Zero in the given currency. First primitive; proves the kernel import resolves. */
export const zero = (currency: Currency): Money => ({
  minorUnits: 0n,
  currency,
});
