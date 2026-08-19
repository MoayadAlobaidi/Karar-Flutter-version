# provider-capabilities — Domain layer

Value objects and the rules over them: the capability assertion, the evidence reference, the closed vocabularies, the profile shape, and the validator.

**May import `shared-kernel`, and other modules only as `import type`.** No framework, no ORM, no HTTP, no clock, no randomness, no filesystem, no network. Nothing here reaches an issuer, and nothing here can.

The most important property of this layer is a state that cannot be reached. `VERIFIED` requires an `EvidenceReference` and a review date as REQUIRED fields, so "we checked" is not expressible without saying where anyone can check it — the shape `modules/financial-accounts` uses for its retention decision, applied to the claim this module exists to make carefully. Three compile-time proofs in `capability-assertion.ts` fail `pnpm typecheck` if that stops being true.

The second most important property is a name that is not here. A profile carries an `InstitutionRef` and no issuer name, brand or label, so provider-specific vocabulary is structurally unrepresentable rather than merely forbidden (ADR-0028).

The cross-module vocabularies — `ConnectionRail`, `AccountType`, `WalletKind`, `InstitutionKind`, `BalanceKind` — are imported as types and never restated. A rail added in `modules/financial-connections` stops every profile literal in this repository compiling until it says something about the new rail: drift is not detected here, it is impossible.

## Import rules

Imported by `application/` and `infrastructure/` within this module. **Never by another module.**
