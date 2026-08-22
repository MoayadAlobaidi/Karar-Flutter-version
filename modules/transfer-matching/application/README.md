# transfer-matching — Application layer

Use cases — one class per business operation — and the **ports** they declare.

Declares the interfaces it needs. **Never names an implementation.** Orchestrates domain objects, enforces authorization, returns `Result`.

`MatchableTransactionAccessPort` is the only question this module asks about a transaction, declared here and satisfied by a composition adapter over `@karar/transactions`' `public-api.ts`. It is also the mechanism behind the claim that **a match may never span two subjects or two tenants**: both sides are resolved through it under the caller's own principal context, so another subject's transaction resolves as absent.

`transfer-match-eraser.ts` is a **mirror** of ports that `@karar/transactions` and `@karar/financial-accounts` must declare so that deleting a transaction, or an account, reaches the matches that name it. It lives here only because those declarations do not exist yet; the file says so at length, and MODULE.md carries the exact TypeScript and call sites.

`SuggestTransferMatch` decides which side is the outflow from the SIGNS rather than from a parameter name — a caller that held the pair the other way round would otherwise store an inflow in the outflow column, and every later reader would believe it.

## Import rules

May import this module's `domain/`, its own ports, and `shared-kernel`. **Never `infrastructure/`.**
