# payment-instruments — Application layer

Use cases — one class per business operation — and the **ports** they declare.

Declares the interfaces it needs. **Never names an implementation.** Orchestrates domain objects, enforces authorization, returns `Result`.

`BalanceBearingAccountAccessPort` is the one question this module asks about an account — does it exist for this principal, and is it in a state that may receive an instrument — declared here and satisfied by a composition adapter over `@karar/financial-accounts`' `public-api.ts`. It deliberately does **not** ask for a balance, and no use case here computes, requests or returns one.

`payment-instrument-eraser.ts` is a **mirror** of a port `@karar/financial-accounts` must declare so that deleting an account reaches the instruments that spend from it. It lives here only because that declaration does not exist yet; the file says so at length, and MODULE.md carries the exact TypeScript the accounts module needs to add.

## Import rules

May import this module's `domain/`, its own ports, and `shared-kernel`. **Never `infrastructure/`.**
