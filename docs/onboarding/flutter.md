# Onboarding — the Flutter client

**Owner:** Documentation owner · **Phase:** 4 (landed) · **Companion to:** [`developer.md`](developer.md)

For someone who has read [`developer.md`](developer.md) and is now going to change `apps/mobile`. It answers the questions that come up in the first week and links to the canonical home for each rule rather than restating it. The architecture is [`../architecture/flutter.md`](../architecture/flutter.md); the enforced per-directory contract is [`../../apps/mobile/lib/README.md`](../../apps/mobile/lib/README.md); what Phase 4 did and did not deliver is [`../phases/phase-04.md`](../phases/phase-04.md).

---

## 1. Get it running

```bash
make bootstrap                                                  # workspace + Flutter dependencies
cd apps/mobile && flutter run --dart-define=KARAR_ENV=LOCAL     # defaults to http://localhost:3000
```

**The `--dart-define=KARAR_ENV` is required, and leaving it off is a build failure rather than a default.** Since the per-environment application identifiers landed, a build told nothing about its environment is refused instead of silently becoming a production-identified artifact. The same applies to building from the Xcode IDE: if you press Run in Xcode without the define reaching the build, the packaged-bundle phase refuses it. That is the intended behaviour, not a rough edge — see §7.

`LOCAL` is the only profile that needs no explicit endpoint. Every other profile refuses to build without one — also §7.

The API must be running for anything past the sign-in screen: `make dev`, then the api entrypoint. Tenant-scoped screens additionally need the local first-party tenant (`node scripts/db/seed-local-first-party.mjs`), and the consent screen needs the local consent prerequisites (`node scripts/db/seed-local-consent.mjs`, which refuses any environment other than `local` or `test`).

## 2. Run the checks before you push

```bash
cd apps/mobile
flutter analyze
dart run tool/generate_api_client.dart --check   # contract/client drift
flutter test test/l10n                           # the localization gate, on its own
flutter test --exclude-tags golden               # the suite, exactly as CI runs it
```

`make test` runs the workspace suite and this same Flutter invocation, golden exclusion included, **so the local gate and CI agree about which tests exist**. Goldens are run deliberately with `make test-golden`; they are not CI-enforced, and [`../architecture/flutter.md` §5](../architecture/flutter.md) explains why.

## 3. Where does my code go?

| I am adding… | It goes in |
|---|---|
| A screen for an existing feature | `lib/features/<feature>/presentation/` |
| A new feature | `lib/features/<new>/` with `domain/ data/ presentation/`, plus a registration — see §5 |
| A reusable widget | `lib/shared/design_system/components/` — never a feature folder |
| A colour, spacing or type value | `lib/shared/design_system/tokens/` — never a literal at a call site |
| Anything cross-cutting and feature-agnostic | `lib/core/<area>/` |
| A user-facing string | `lib/l10n/arb/app_en.arb` **and** `app_ar.arb` — never a Dart file |

**Features do not import each other.** If two need the same thing, it belongs in `shared/` or `core/`.

## 4. The four rules that fail a build

1. **Domain purity.** A file under `features/*/domain/` imports pure Dart, `package:meta`, `core/errors` and `core/utilities` — and nothing else. No Flutter, no Riverpod, no router, no dio, no secure storage, no generated DTO, no `dart:convert`/`dart:io`/`dart:ui`, no analytics package of any kind. `test/core/architecture/layer_rules_test.dart` scans for it.
2. **No literal user-facing string.** `Text('Save')` fails `test/l10n/localization_lint_test.dart`. Use an ARB key.
3. **No hardcoded direction.** `EdgeInsets.only(left:)`, `EdgeInsets.fromLTRB`, `Alignment.centerLeft`, `TextAlign.left`, `Positioned(left:)`, `BorderRadius.horizontal` and `BorderRadius.only(topLeft:)` all fail the same test. Use the `Directional` variants. **Arabic reads right to left, so a left inset is a defect, not a style choice.**
4. **No `print`.** The analyzer bans it. Diagnostics go through `core/logging`, which redacts.

## 5. How do I add a screen without touching the shell?

You do not edit `app/routing/`. A feature registers itself by overriding one of three providers, merged in `app/composition/feature_surface.dart`:

- `featureRoutesProvider` — routes reachable once the application is `READY`.
- `startupScreenOverridesProvider` — a real screen for one startup state, replacing the placeholder gate.
- `homeScreenBuilderProvider` — the authenticated home.

A Riverpod override *replaces* a provider's value, so two workstreams each calling `overrideWithValue` independently would leave only the last standing. `feature_surface.dart` is the single merge point, and it is the only file that knows every workstream exists.

**There is exactly one redirect in the application**, in `app/routing/app_router.dart`, driven by the startup coordinator. Adding a second reintroduces the bug the coordinator exists to prevent.

## 6. What decides which screen a launch reaches?

`app/lifecycle/startup_coordinator.dart`, and nothing else. **Fourteen** states, each mapping to one route and one recovery action. **Protected content renders in `READY` and nowhere else, and a feature never decides any of this for itself.**

The order matters and is deliberate: configuration, then the **local security state**, then the application lock, then session restore, then bootstrap — and within a successful bootstrap: email verification, tenant binding, capability resolution, operating-entity state. If you find yourself wanting a screen to check one of these itself, the coordinator is the place to change instead.

Two of the fourteen are security states, and each exists because the alternative was a fail-open default:

- `LOCAL_SECURITY_STATE_UNAVAILABLE` — the security-state store could not be opened or read. The lock choice is unknown, and **an unknown lock choice must never be spent as "off"**, so the launch stops here rather than further down. This is why the security state is loaded as its own step *before* the lock is evaluated: the lock cannot be checked against a value nobody managed to read.
- `SECURITY_RECOVERY_BLOCKED` — a session was abandoned and neither the credential deletion nor the durable invalidation could be confirmed. The application refuses to present a clean signed-in *or* signed-out state and offers retry.

Both sit beside the lock and sign-in routes so the single redirect converges in one hop rather than oscillating.

## 7. How do environments and endpoints work?

Five dart-defines: `KARAR_ENV`, `KARAR_API_BASE_URL`, `KARAR_APP_VERSION`, `KARAR_BUILD_NUMBER`, `KARAR_BRAND_ID`. Only the first two matter day to day, and only in `LOCAL` can the second be omitted. **`KARAR_ENV` can never be omitted** — see §1.

```bash
flutter build apk --debug -Pkarar.env=LOCAL --dart-define=KARAR_ENV=LOCAL
```

On Android the Gradle property and the dart-define are cross-checked, and a mismatch fails the build. For any environment other than `LOCAL`, both platforms refuse a build with no endpoint, a non-HTTPS endpoint, an endpoint carrying credentials, or an endpoint whose host resolves only on a developer machine — including IPv6 loopback and the trailing-dot form of `localhost`. **The build fails at configuration time, before an artifact exists**, and on iOS the packaged-bundle check runs before code signing.

**The environment also decides the application identifier, and that is why the define is mandatory.** Each environment ships under its own identifier on both platforms:

| Environment | Android and iOS identifier |
|---|---|
| LOCAL | `com.kararfinance.app.local` |
| DEV | `com.kararfinance.app.dev` |
| STAGING | `com.kararfinance.app.staging` |
| PRODUCTION | `com.kararfinance.app` |

The iOS rule lives in the packaged-bundle build phase rather than in an xcconfig, because the Flutter tool forwards dart-defines into Xcode as a base64 CSV and xcconfig has no string functions to decode it. That phase derives the expected identifier, refuses anything outside the four, narrows the packaged plist when the configuration default and the compiled environment disagree, and re-reads the plist to confirm on every branch. If a development team or provisioning profile is set and narrowing would be required, **the build fails** rather than emitting an artifact whose identifier no longer matches its profile.

**You cannot produce a deployed-environment package today**, and that is the guards working rather than a gap: no endpoint exists for `DEV`, `STAGING` or `PRODUCTION`. `LOCAL` is what builds.

**The client holds no secret.** A dart-define whose *name* looks credential-shaped is a configuration violation. If you think you need one on the device, you need a server endpoint instead.

## 8. How do I change the API surface?

Never by editing `lib/core/networking/generated/`. Change the contract in `packages/api-contracts/openapi/`, then:

```bash
cd apps/mobile && dart run tool/generate_api_client.dart          # regenerate
cd apps/mobile && dart run tool/generate_api_client.dart --check  # what CI runs
```

If generation fails, read the error rather than working around it — the generator refuses only where guessing would be worse than stopping: an operation whose contract gives no response schema, two schema-carrying 2xx responses, a union with no declared discriminator, and a wire value that cannot become a distinct Dart identifier. Each names the contract text at fault, and each is fixed in the contract.

Generated DTOs stay in the data layer. A repository maps them into domain types and never lets one escape.

## 9. How do I handle a failure?

Return a value, do not throw. Every fallible operation returns `Result<T>` carrying a sealed `Failure`, so a `switch` over the outcome is exhaustiveness-checked. In a repository implementation — and nowhere else — catch `ApiException` and map it, and **always** include the `FormatException` and `TypeError` arms: a payload the decoder cannot classify must become a typed failure so a server that adds a union branch degrades the client instead of crashing it.

Never render a server-authored `title` or `detail`. Show your own localized message and, where one exists, the correlation reference.

## 10. How do I add a string?

Add the message to `app_en.arb` **with an `@key` block carrying a `description`** — the generator requires it, so a translator never guesses at intent — add the Arabic to `app_ar.arb`, then `flutter gen-l10n`. The generated Dart is committed so a clean clone analyzes without a generation step.

The localization gate will fail you for: a key in one language and not the other, a blank message, a missing description, a placeholder mismatch, an English plural that is not plural in Arabic, an Arabic plural missing the `few`/`many`/`other` arms, generated Dart that no longer matches the ARB, the legacy spelling **قرار** used as the product name (the product is **كرار**), or a literal Arabic-Indic digit in a message.

That last one is worth understanding rather than working around: bare `ar` and `ar_QA` render Western digits by CLDR, so a message that hardcodes `٨` sits next to a placeholder that renders `8` — one field, one requirement, two alphabets. Numbers go through `KararFormatter`.

## 11. How do I test a screen?

Use `pumpKarar` from `test/shared/harness.dart`, and `testInBothDirections` to get one test per shipped locale — and per text scale where you pass `testTextScales`.

**You cannot pass a text direction, deliberately.** It is derived from the locale by the framework, which is the only way a test proves that Arabic produces an RTL tree rather than proving you remembered to ask for one.

What a screen test is expected to assert, because the existing suites do: every interactive control carries a semantic name; the layout does not overflow at 2.0x text scale; controls meet the 48px floor; and nothing renders a value the fixture did not supply.

**Do not add a golden under `test/features`.** A test enforces this, and the reason is disclosure rather than tidiness: a golden is a committed image of whatever was on screen, and the MFA setup key, the recovery codes and the session list must never end up in one.

## 12. What must never appear in the client?

- A financial figure the platform did not compute (ADR-0007) — and no placeholder, skeleton or "example" figure either.
- A fabricated account, connection, or sync status. This was the legacy's worst surface, and Phase 5 has made the temptation concrete rather than hypothetical: the server now holds accounts, connections and payment instruments in its schema. **None of it is reachable, no feature folder exists for it, and none may be added yet** — and when one is, the word "Connected" is still forbidden, because only the `MANUAL` and `USER_FILE_UPLOAD` rails may exist, no credential is stored anywhere, and no issuer exposes an interface to Karar. The server cannot express the claim; the client must not invent it in a label.
- A capability the server did not return. An omitted capability is one the client **must not know exists**; rendering "coming soon" for it defeats the server-side filter entirely.
- A token, header, cookie, password, verification or reset code, MFA secret, recovery code, consent evidence, or request/response body in a log.
- Any analytics, crash-reporting, advertising or fingerprinting SDK.

The first three are the same rule from three directions: **the client shows what the platform said, or it shows an empty state.**
