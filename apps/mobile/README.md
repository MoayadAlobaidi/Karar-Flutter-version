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
flutter pub get
flutter run                              # LOCAL profile; defaults to http://localhost:3000
flutter analyze
flutter test --exclude-tags golden       # exactly what CI runs
```

`LOCAL` is the only profile that builds without an explicit endpoint. A `DEV`, `STAGING` or `PRODUCTION` build is refused at configuration time unless it is given an HTTPS endpoint that is not a developer-machine address — on Android by the Gradle guard, on iOS by a build phase that runs before code signing.

Golden baselines are excluded from the command above and from CI, deliberately. Run them with `make test-golden` from the repository root; the reasoning is in [`flutter.md` §5](../../docs/architecture/flutter.md).

## State

The Phase 4 foundation: ten feature folders covering authentication, MFA, email verification, password recovery, sessions and application lock, profile, settings, tenant selection, consent, and platform bootstrap. **Every one of them is account, identity or platform state.** No financial capability exists in any layer — no account, transaction, balance, budget, goal, insight or monetary value appears in a screen, a fixture, or a test.
