# transactions — Infrastructure layer

Implementations of the ports: Prisma repositories, provider adapters, storage, key management.

**This is the only layer that names a vendor.** It is also the only layer containing the ORM — no Prisma type escapes it (architecture test 4).

## Import rules

May import this module's `application/` ports and `domain/`, plus frameworks. **Never another module's internals.**

---

_Phase 5: implemented. Prisma repositories for the transaction aggregate and
the categorisation chain, the two account-scoped adapters
`modules/financial-accounts` consumes (record presence and record erasure), a
UUID v7 id source, and three LOCAL/TEST provider adapters that say what they
are — two hold key material in process memory, which production must not do,
and production binds the same ports to adapters over the platform's
key-management provider (ADR-0017). The third,
`LocalSyntheticRetentionDecisionProvider`, carries no legal effect, so it must
not be able to govern real data._

_**Every one of the three is reached through a resolver, and every resolver
refuses outside `KARAR_ENV=local`:** `resolveHsfFieldEncryptionPort`,
`resolveDedupFingerprintPort` and `resolveTransactionRetentionDecisionPort`.
Each returns the deployment's approved provider when one is wired and throws a
typed error when none is — never a generated key, which would leave stored
ciphertext unreadable and stored dedup digests incomparable. The two key
holders also take their key material as a REQUIRED argument, so neither can
mint its own: a composition root cannot obtain a working local provider by
reordering its lines, extracting a helper or constructing lazily. Before that,
those two carried no guard at all and were safe only because other
constructors threw on earlier lines._
