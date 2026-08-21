# Flutter client

The consumer application. **Performs no authoritative financial math** (ADR-0007) — it renders values the platform computed, and shows an empty state where it has none.

Adding a capability adds a folder under `lib/features/` and a route registration. **Nothing else.** If a capability requires editing the shell, the seam is wrong.

## Where to read next

| | |
|---|---|
| The enforced per-directory contract — layering, domain purity, conventions | [`lib/README.md`](lib/README.md) |
| Architecture: navigation, startup, RTL, storage, build guards | [`../../docs/architecture/flutter.md`](../../docs/architecture/flutter.md) |
| First week working here — commands, rules, how to add a screen or a string | [`../../docs/onboarding/flutter.md`](../../docs/onboarding/flutter.md) |
| What the Phase 4 foundation does and does not include | [`../../docs/phases/phase-04.md`](../../docs/phases/phase-04.md) |

## Import rules

Consumes the generated Dart client in `lib/core/networking/generated/`, which is produced from `packages/api-contracts` and **never hand-edited** — a drift check fails CI. Never talks to the database.

## Run

```bash
flutter pub get --enforce-lockfile              # what CI runs; plain `pub get` is not equivalent
flutter run --dart-define=KARAR_ENV=LOCAL       # defaults to http://localhost:3000
flutter analyze
dart run tool/generate_api_client.dart --check  # contract/client drift
flutter test test/l10n                          # the localization gate, on its own
flutter test --exclude-tags golden              # exactly what CI runs
```

**`--dart-define=KARAR_ENV` is required and has no default.** Each environment ships under its own application identifier — `com.kararfinance.app.local`, `.dev`, `.staging`, and `com.kararfinance.app` for PRODUCTION — so a build told nothing about its environment is **refused** rather than silently becoming a production-identified artifact. This applies to `flutter run` and to building from the Xcode IDE, not only to release assemblies.

`LOCAL` is the only profile that builds without an explicit endpoint. A `DEV`, `STAGING` or `PRODUCTION` build is refused at configuration time unless it is given an HTTPS endpoint that is not a developer-machine address — on Android by the Gradle guard, on iOS by a build phase that runs before code signing. **No endpoint exists for any of those three, so `LOCAL` is the only package this repository can currently produce.** That is the guards working, not a gap.

Golden baselines are excluded from the command above and from CI, deliberately. Run them with `make test-golden` from the repository root; the reasoning is in [`flutter.md` §5](../../docs/architecture/flutter.md).

The mobile security suite's artifact assertions are gated: with `KARAR_VERIFY_ANDROID_ARTIFACT=1` or `KARAR_VERIFY_IOS_ARTIFACT=1` set, a **missing artifact fails rather than skips**. Without a build present they report as skips, which is why the suite's count differs between a clean checkout and a tree that has built something ([`phase-04.md`](../../docs/phases/phase-04.md)).

## State

Seventeen feature folders. Ten are the Phase 4 foundation — authentication, MFA, email verification, password recovery, sessions and application lock, profile, settings, tenant selection, consent, and platform bootstrap — and **every one of those is account, identity or platform state**. Seven are the Phase 5 financial surface: accounts and wallets, transactions, categories, payment instruments, statement imports, transfer matching, and connections and sources.

**Phase 5 built a financial data platform on the server, and this client now reads it.** Accounts and wallets, transactions, connections and source links, payment instruments, transfer matching and CSV statement imports exist behind migrations 0087-0101, and **27 operations over 21 `/financial/*` paths are mounted and answer requests.** The generated client carries 27 financial methods among its 62, and seven feature folders call them. **What has not changed is the part that matters**: a route answering on a developer's machine is not a capability being available. Every financial route is gated inside its builder on the platform's own answer and re-evaluated on every build, nothing is deployed, `TRANSACTIONS` is `NOT_IMPLEMENTED`, and `navigableCapabilityIds` is empty. One gap is worth stating here rather than leaving to be discovered: the statement-import flow sits above a picker port whose Android and iOS adapters are implemented and compile, and which no build has yet exercised on a device.

Two rules travel with that work, and they bind this client before its first financial screen is written. **Nothing may render "Connected", "Synced" or "Linked" for financial data**: only the `MANUAL` and `USER_FILE_UPLOAD` rails may exist, no credential is stored anywhere in the platform, and no issuer exposes an interface to Karar — a connection badge here would be the legacy's most misleading surface rebuilt. And **no figure may be totalled on the device**: a payment instrument carries no balance, a transfer match carries no amount, and a reported balance always names which balance it is, so a client summing anything would be inventing the number rather than rendering one.

## What this client is not

Stated here rather than left to be discovered, because a mobile client is where the distance between "the mechanism exists" and "it was seen to work" is widest:

- **No signed build exists, and no signing material is in this repository.** iOS builds use `--no-codesign`; an Android release with incomplete signing material fails rather than falling back to the debug key.
- **The biometric prompt has never been exercised on a device**, on either platform or at any API level. What exists is source, compile-time and built-artifact verification.
- **No store submission has been attempted**, and nothing here is app-store ready.
- **No offline cache exists** — every read goes to the API — and **screenshots and screen recording are not prevented**; the sensitive-screen wrapper covers its subtree on backgrounding and states that limit itself.
- **The navigable-capability set is empty**, correctly: nothing is implemented, so nothing is navigable.

The complete list, with what each one would take to close, is in [`phase-04.md`](../../docs/phases/phase-04.md).
