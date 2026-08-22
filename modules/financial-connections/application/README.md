# financial-connections — Application layer

Use cases — one class per business operation — and the **ports** they declare.

Declares the interfaces it needs. **Never names an implementation.** Orchestrates domain objects, enforces authorization, returns `Result`.

`CanonicalAccountAccessPort` is the one question this module asks about an account, declared here and satisfied by a composition adapter over `@karar/financial-accounts`' `public-api.ts`. `SourceAccountFingerprintPort` is where the keyed, per-subject, versioned equality value comes from; nothing in this layer knows how it is derived.

## Import rules

May import this module's `domain/`, its own ports, and `shared-kernel`. **Never `infrastructure/`.**
