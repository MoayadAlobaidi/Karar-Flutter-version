// Phase 1 placeholder, reconciled to the real kernel in Phase 2: establishes
// the package boundary and the build. The engine itself arrives in Phase 6
// (docs/architecture/financial-engine.md). May import @karar/shared-kernel
// and nothing else.
import { Currency, Money } from '@karar/shared-kernel';

/** Zero in the given currency. First primitive; proves the kernel import resolves. */
export const zero = (currency: Currency): Money => Money.zero(currency);
