# Flutter Client Architecture

**ADRs:** 0007, 0009 · **Phase:** 4 (foundation — landed), 9 (features), 11 (flavors), 15 (embedded) · **Canonical for:** client structure, capability-aware navigation, the startup state machine, Arabic and RTL enforcement, client dependency governance

Sections describing the Phase 4 foundation report what is in the repository. Sections describing later phases remain decisions. What Phase 4 did **not** deliver, and every limitation it carries, is in [`../phases/phase-04.md`](../phases/phase-04.md); that report is the honest-status source and this document links to it rather than restating it.

---

## 1. The governing rule

> **Flutter is a *client* of the platform. It performs no authoritative financial math.**

Every figure the user sees was computed by `financial-engine` and delivered over the API. The client formats and renders; it does not calculate. There is no second implementation of a savings rate, a category share, a nisab threshold, or a zakat due amount.

**What the client may compute:** layout, pagination, scroll offsets, animation, client-side filtering of already-fetched data, and input validation that is re-validated server-side.

**What it may never compute:** anything a user would treat as a financial fact.

This is not a purity argument. Two implementations of a financial rule drift, and the one on the device is the one you cannot fix without a store review.

## 2. No mechanical migration

The legacy client is **React Native** — 423 files, 40 screens, 25 feature modules ([`../legacy/qarar-audit.md` §3](../legacy/qarar-audit.md)). Karar's Flutter client is a **rebuild against the platform contract**, not a port.

The reason is concrete rather than aesthetic. A meaningful share of the legacy client's behaviour is device-local mock data: a family-budget screen backed by a static sample file with a no-op invite button, and a bank-connection flow that *"runs a one-second animation and then inserts a fabricated account row into local state."* Porting that structure would port those decisions. Rebuilding against an OpenAPI contract that only exposes capabilities the platform actually has makes the fabrication impossible to express.

## 3. Structure

As landed in Phase 4. The canonical, enforced version of this layout — including the domain-purity import ban and the conventions each directory carries — is [`apps/mobile/lib/README.md`](../../apps/mobile/lib/README.md); this is the map, that is the contract.

```
apps/mobile/
├── lib/
│   ├── main.dart         — entrypoint, one line
│   ├── app/              — the shell: how the application starts and navigates
│   │   ├── bootstrap/          binding, error handlers, composition assembly
│   │   ├── composition/        the feature surface features register into
│   │   ├── configuration/      build/runtime configuration and its validation
│   │   ├── dependency_injection/ Riverpod providers — the ONLY composition root
│   │   ├── lifecycle/          the startup state machine
│   │   └── routing/            routes and the single redirect
│   ├── core/             — cross-cutting foundation, feature-agnostic
│   │   ├── errors/             the Failure taxonomy and Result
│   │   ├── localization/       locale/theme preference — no message catalogues
│   │   ├── logging/            redacting logger; the only diagnostic sink
│   │   ├── networking/         transport, RFC 7807 mapping, refresh coordinator
│   │   │   └── generated/      GENERATED API client — never hand-edited
│   │   ├── security/           secure storage, session, application lock
│   │   ├── storage/            non-sensitive preferences
│   │   └── utilities/          clock, cancellation, correlation ids
│   ├── features/         — ten features, each domain/ data/ presentation/
│   ├── shared/           — design_system/, extensions/, formatting/
│   └── l10n/             — ARB sources and generated message catalogues
└── test/
```

The ten features are `authentication`, `consent`, `email_verification`, `mfa`, `password_recovery`, `platform_bootstrap`, `profile`, `session_management`, `settings`, `tenant_selection`. **Every one of them is account, identity, or platform state.** No feature folder exists for a product capability, because no product capability exists.

**Adding a capability adds a folder under `features/` and a route registration. Nothing else.** If a new capability requires editing the shell, the seam is wrong — see [`extension-pattern.md`](extension-pattern.md). The mechanism is concrete rather than aspirational: a feature registers into `app/composition/feature_surface.dart` by overriding `featureRoutesProvider`, `startupScreenOverridesProvider`, or `homeScreenBuilderProvider`, and **`app/routing/` is not edited**. There is exactly one redirect in the application, in `app_router.dart`, driven by the startup coordinator; a second would reintroduce the bug the coordinator exists to prevent.

Each feature folder mirrors the backend's layering: `domain/` (entities, value objects, use cases, repository ports, failures), `data/` (DTO mapping, repository implementations), `presentation/` (Riverpod providers, immutable view state, widgets). Dependencies point inward only. Features do not import each other; shared behaviour goes to `shared/`.

**Domain purity is the rule the rest rests on**, and it is enforced rather than reviewed: a file under `features/*/domain/` may not import Flutter, Riverpod, go_router, dio, secure storage, biometric or platform-channel plugins, the generated DTOs, `dart:convert`/`dart:io`/`dart:ui`, or any analytics or fingerprinting package. `test/core/architecture/layer_rules_test.dart` scans for it.

## 4. Capability-aware navigation

The client does not decide what exists. **The platform tells it**, and the client renders that answer honestly.

As landed in Phase 4, the mechanism is an **allowlist, never a denylist**, in `features/platform_bootstrap/domain/platform_capability.dart`. A `CapabilityNavigationResolver` walks the capabilities the bootstrap response returned and keeps only those that are both `AVAILABLE` and present in a compile-time `navigableCapabilityIds` set. An identifier outside that set produces no destination, is not counted, is not summarised, and reaches no state the presentation layer can read. **There is deliberately no "unrecognised" list**, because such a list would itself be a channel for the names it holds.

`navigableCapabilityIds` is **empty in this build**, which is the correct state: no capability is implemented anywhere, so nothing is navigable.

**Phase 5 does not change that, and the reason now needs stating precisely, because the earlier version of this paragraph is out of date in a way that matters.** The server grew a financial data platform — accounts and wallets, transactions, connections and source links, payment instruments, transfer matching, CSV statement imports — and **27 operations over 21 `/financial/*` paths** are mounted and answer requests. This paragraph used to add that nothing consumed them: no feature folder, no route, no provider, no screen. **That is no longer true.** The client now holds **seven** financial feature folders — `financial_accounts`, `transactions`, `transaction_categories`, `payment_instruments`, `statement_imports`, `transfer_matching` and `financial_connections` — with routes, providers, repositories and screens, all reading through the generated client.

**`navigableCapabilityIds` is still empty, and that is still correct.** The two facts are not in tension, and the distinction is the whole point: a route mounted in a local build is not a capability the platform has granted. Every financial route is contributed unconditionally and gated *inside its builder* on `financialSurfaceEnabledProvider`, which is derived from the bootstrap answer and re-read on every build — so a session whose platform does not report `TRANSACTIONS` as available renders the refusal, reads no provider, and issues no request. `test/security/deep_link_authorization_test.dart` proves that for every route, deriving the paths from the shell's own route table rather than a written-down list. That was not true when first written — the derivation named four contributions, so an ungated route mounted directly into the composition root was walked by nothing and passed all ten tests. The table is now the concatenation of named contributions and the suite asserts the shell mounts exactly it, so the route that used to slip through now fails. `TRANSACTIONS` still enters `navigableCapabilityIds` only when it is implemented *and* deployed *and* deliberately added — three separate acts, in that order, and none of them is "a screen exists".

One rule from the data model came with that surface, and it holds today: **nothing renders "Connected", "Synced" or "Linked" for financial data.** Only the `MANUAL` and `USER_FILE_UPLOAD` rails may exist, no credential is stored anywhere, and no issuer exposes an interface to Karar — so a connection badge would be the legacy's most misleading screen rebuilt in a new framework, which is precisely what §1's rebuild-rather-than-port argument exists to prevent. The server cannot express the claim; the client must not invent it in a label.

Four rules:

1. **Deny by default.** An unknown capability renders as absent, never as available. `BootstrapSnapshot.hasCapability` returns false for an absent id, and false for *every* id when capability resolution did not complete.
2. **An omitted capability is not a denied one.** The server omits a hidden capability from the response entirely, so there is nothing for the client to filter and nothing for it to explain. A client that rendered "coming soon" for an omitted id would defeat the filter.
3. **A resolution failure is not an empty result.** The bootstrap response's capability section is a discriminated shape. `RESOLVED` with zero items reaches the signed-in surface and renders an honest empty state; a resolution that could not be performed becomes `BOOTSTRAP_UNAVAILABLE` and renders an outage screen that names no service, no entitlement, and no dependency. Three files hold that distinction apart, and it is asserted in both directions.
4. **Routes are gated at the router**, not inside the screen. `routeFor` on an unregistered capability throws rather than guessing a path.

Amanat, when unavailable, is invisible: no nav entry, no route, no empty state. Plan §6.3 item 10.

### The startup state machine

Which screen a launch reaches is decided in exactly one place — `app/lifecycle/startup_coordinator.dart` — and the router carries exactly one redirect, driven by it. A feature never decides any of this for itself, and a second redirect reintroduces the bug the coordinator exists to prevent.

Fourteen states, each mapping to exactly one route and declaring one recovery action: `CONFIG_LOADING`, `CONFIG_INVALID`, `LOCAL_SECURITY_STATE_UNAVAILABLE`, `SECURITY_RECOVERY_BLOCKED`, `APP_LOCKED`, `SESSION_RESTORING`, `UNAUTHENTICATED`, `SESSION_EXPIRED`, `MFA_CHALLENGE_REQUIRED`, `EMAIL_VERIFICATION_REQUIRED`, `TENANT_SELECTION_REQUIRED`, `BOOTSTRAP_LOADING`, `BOOTSTRAP_UNAVAILABLE`, `READY`. **Protected content renders in `READY` and nowhere else.**

The security state is loaded as an explicit step before the lock is evaluated, because the lock cannot be checked against a value nobody managed to read. `LOCAL_SECURITY_STATE_UNAVAILABLE` is where a launch stops when the security-state store will not open or read — an unknown lock choice is never spent as "off". `SECURITY_RECOVERY_BLOCKED` is where it stops when a session was abandoned without a confirmed credential deletion or a confirmed durable invalidation. Both offer retry, and both sit beside the lock and sign-in routes so the redirect converges in one hop.

The evaluation order is what makes it fail closed, and each step is terminal for the ones after it: configuration is validated first and an invalid build stops there rather than proceeding to a sign-in screen it cannot serve; the application lock is checked before any token is read; the session is restored before bootstrap is attempted; and a secure-storage failure during restore is treated as *unauthenticated*, never as an empty store. Within a successful bootstrap the order is email verification, then tenant binding, then capability resolution, then operating-entity state — so a person is never asked to choose a tenant before their address is verified, and a degraded dependency never presents itself as a working home screen.

## 5. Arabic and RTL are first-class from Phase 4

Not a late localization pass. The legacy shipped EN/AR with RTL and *still* found untranslated category names, residual English strings, and RTL alignment defects — because retrofitting bidirectional layout finds every hardcoded `EdgeInsets.only(left:)` one screen at a time.

| Rule | Enforcement, named by the artifact that does it |
|---|---|
| No hardcoded user-facing string reaches a screen | [`test/l10n/localization_lint_test.dart`](../../apps/mobile/test/l10n/localization_lint_test.dart) — "no user-facing string literal is passed to `Text()`", a whole-file scan of every source under `lib/`. Whole-file rather than line-by-line because the formatter puts almost every argument on its own line |
| Directional layout only — `start`/`end`, never `left`/`right` | The same file's "layout is directional, never left or right", which bans seven shapes: `EdgeInsets.only(left:/right:)`, `EdgeInsets.fromLTRB`, the six `Alignment` corners, `TextAlign.left/right`, `Positioned(left:/right:)`, `BorderRadius.horizontal`, and `BorderRadius.only(top/bottomLeft/Right)` |
| Arabic is a first-class test locale, not an afterthought | `testInBothDirections` in [`test/shared/harness.dart`](../../apps/mobile/test/shared/harness.dart) declares one test per shipped locale for every design-system component suite and every feature screen suite. **Direction is never passed in** — it is derived from the locale by the framework, which is the only way a test proves that Arabic produces an RTL tree rather than proving the author remembered to ask for one |
| Both locales stay in the same catalogue | `test/l10n/` asserts key parity between the ARB files and the single Arabic product name; the localization step runs as its own CI job (`flutter test test/l10n`) ahead of the full suite |

**These are tests, not analyzer rules.** No lint package carries the string-literal or directional-layout rules, and [`analysis_options.yaml`](../../apps/mobile/analysis_options.yaml) does not encode them; the source scan is what holds them. Stated because "lint rule" in a document and a scan in the suite fail differently — a scan is skipped by running a narrower test selection, an analyzer rule is not.

### Golden baselines — what they cover, and what they do not

**Four baselines exist, and they are not CI-enforced.** The set is [`test/shared/design_system/goldens/`](../../apps/mobile/test/shared/design_system/goldens): two design-system compositions — the button family, and a text field carrying label, error and counter at once — each rendered in English and in Arabic, both in light mode. **No screen has a golden.** There are 22 `*_screen.dart` files under `lib/features/`, and not one is captured in an image.

That is a decision with two separate reasons, both of them holding.

1. **Feature tests are forbidden from committing one, deliberately.** [`identity_module_test.dart`](../../apps/mobile/test/features/authentication/identity_module_test.dart) walks `test/features` and fails on any `matchesGoldenFile` call or any `goldens` directory. The reason is disclosure, not tidiness: a golden is a committed image of whatever was on screen, and the MFA setup key, the recovery codes, and the session list must never be captured into one. A per-screen golden convention would put that guarantee back in a reviewer's memory.
2. **A large golden set stops being read.** The design-system set is kept small on purpose — fifty screenshots break together on an unrelated change and teach the team to regenerate without looking.

**Their platform status, stated plainly because two in-repo comments flatly disagree about it.** The baselines are 800x600 PNGs committed in `3383b2f`, rasterised on the maintainer's macOS arm64 workstation, and the default comparator — Flutter's `LocalFileComparator`, exact-match, configured nowhere and therefore zero-tolerance — still passes there. (They are 800x600 rather than the 320-wide frame the test names because the frame carries no `RepaintBoundary`, so the capture walks up to the root and rasterises the whole default test surface.)

The disagreement: the CI workflow's own comment states that font rendering differs across platforms, so the baselines *cannot* match on `ubuntu-latest` and would fail a required check for a reason unrelated to any change. [`goldens_test.dart`](../../apps/mobile/test/shared/design_system/goldens_test.dart) states the opposite — that Flutter's built-in test font makes them deterministic across machines for layout and colour, which if true would make the exclusion unnecessary. The [`Makefile`](../../Makefile) and [`dart_test.yaml`](../../apps/mobile/dart_test.yaml) hedge toward the first without asserting it.

**Neither statement has been tested. The baselines have never been executed on Linux or on any GitHub runner.** Until they are, their cross-platform behaviour is `UNVERIFIED` — not "fine", and not "known to break". Whoever resolves it should delete the losing comment rather than adding a third.

**They are excluded from CI, and from `make test`.** The suite carries `@Tags(['golden'])` (declared in [`dart_test.yaml`](../../apps/mobile/dart_test.yaml)); the CI mobile job runs `flutter test --exclude-tags golden`, and `make test` matches it so the local gate and CI agree about which tests exist. `make test-golden` runs them deliberately. **Nothing in CI compares a pixel**, and no document should say otherwise.

What the goldens would add that the rest of the suite does not:

| Not covered without them | Why the structural assertions cannot reach it |
|---|---|
| Absolute pixel geometry | Widget assertions check relative order, presence, and minimum sizes; they never assert that a control is at a particular offset |
| Composite appearance | Each component is asserted alone. Nothing asserts that a button family, side by side, still reads as one family |
| Rendered-token fidelity | Token *values* are asserted (`tokens_test.dart`) and their contrast ratios are computed (`color_contrast_test.dart`); that a widget actually painted with the token it resolved is not |
| Dark-mode rendering | **No widget is ever pumped in dark.** `pumpKarar` accepts a `brightness` and no caller passes `Brightness.dark`; the dark palette is exercised only at the token level. The dark theme is therefore proven as data, never as a rendered tree |

What is already enforced without them, so the gap is a gap and not a hole:

| Enforced | Where |
|---|---|
| Text direction derived from the locale, and reading order in both | `testInBothDirections`; `test/shared/design_system/rtl_layout_test.dart` |
| Minimum 48px tap targets, at 1.0x and 2.0x text scale | The component suites under `test/shared/design_system/` |
| Semantics: labels, and sensitive subtrees excluded from assistive technology | `test/features/authentication/identity_module_test.dart` and the component suites |
| WCAG 2.1 contrast — 4.5:1 for text, 3:1 for component boundaries — over **both** the light and dark palettes | `test/shared/design_system/color_contrast_test.dart` |
| No layout overflow at 2.0x text scale | The component and feature screen suites |
| Icon mirroring under RTL | `test/shared/design_system/karar_navigation_test.dart` — every member of the curated directional-icon list is asserted to mirror, and an icon that merely looks directional is deliberately excluded because the framework does not mirror it |
| The static ban on hardcoded directional layout | `test/l10n/localization_lint_test.dart` (above) |

**Owner:** Engineering Owner. **Trigger to revisit:** the next change that would either add a fifth baseline or run the `golden` tag anywhere in CI. Whichever comes first forces the decision the exclusion currently defers — execute the baselines on the runner that will judge them and make the comparator's cross-platform behaviour a fact, or drop the set and let the design-system compositions rely on their structural assertions alone. **Adding a screen golden is not that trigger and does not become one:** the `test/features` ban stands regardless, and its reason is disclosure rather than cost.

### Number formatting — the platform decides, the client renders

**The AI model never writes a number** (ADR-0019). Responses arrive as prose with fact placeholders, and Karar substitutes locale-formatted values.

This solves a real problem rather than a theoretical one: Arabic-Indic versus Western digits, U+066B and U+066C separators, currency placement under RTL, and three-decimal currencies (KWD, BHD, OMR). A model asked to render `١٢٬٣٤٥٫٦٧٨ ر.ع.` correctly in every locale will eventually get it wrong. A formatter will not.

The client owns one formatter. Every monetary value goes through it.

## 6. Money on the wire and on the device

Money crosses the API as **minor units + currency code**, never as a decimal string or a float:

```json
{ "amount": { "minorUnits": "1234567", "currency": "QAR" } }
```

`minorUnits` is a **string** in JSON because JavaScript numbers cannot hold a 64-bit integer safely. Dart parses it to `int` (64-bit, safe) and pairs it with the currency's ISO 4217 exponent for display. **No `double` appears anywhere in the money path** — an analyzer rule enforces it.

## 7. Storage and device security

| Data | Storage |
|---|---|
| Tokens, keys | Keychain / Keystore via `flutter_secure_storage` |
| Anything `CONFIDENTIAL` or above | Secure storage only |
| `SEALED` | **Never cached, never persisted, never written to disk** |
| Cache, preferences | Ordinary storage — non-sensitive only |

As landed in Phase 4, that first row is **one entry**: `core/security/token_store.dart` writes a single namespaced key holding the access and refresh tokens, their expiries, and the session id. Nothing else is in secure storage. The options are chosen rather than defaulted, and the reasons are recorded next to them: iOS and macOS use `first_unlock_this_device` — `unlocked` would break refresh on a device sitting locked in a pocket, and `this_device` keeps the credential out of iCloud Keychain and off any restored backup; Android sets `resetOnError`, so a key-material change drops undecryptable ciphertext and forces re-authentication rather than leaving a half-readable store.

**A secure-storage failure fails closed.** Every operation returns a `Result`: `Success(null)` means genuinely absent, `Failed` means the store could not be consulted, and the application then behaves as though no credential exists. On failure only the key *name* is logged — never the value, and never the platform's error message, which can echo the entry.

Non-sensitive preferences live in a separate, deliberately unencrypted store, and `PreferenceKey` refuses at construction to accept a credential-shaped key name, so the wrong store cannot be chosen by habit.

**There is a third store, and it exists because of a fail-open defect in the second one.** Security-relevant flags — whether the application lock is on, and whether a persisted session was abandoned — were kept in the ordinary preference store. That store swallows a failed write and logs it, and when the platform store cannot be opened at all it substitutes an in-memory one. Both behaviours are correct for a dismissed hint or a theme choice. For the lock flag they compose into a fail-open: an unopenable store reads as absent, absent reads as `false`, and `false` reads as *the user never turned the lock on*.

`LocalSecurityStateStore` is the narrow port that replaces that usage, and every property of it is a reaction to that composition:

| Property | Why |
|---|---|
| Key type is a closed enum of two flags | No credential-shaped key is expressible at all |
| Every operation returns a sealed outcome | A read distinguishes a value, a genuine absence, an unavailable store and a corrupt one; a write distinguishes success, refusal and unavailability |
| **No in-memory fallback** | When the platform store will not open, the port returns an implementation that reports unavailability to every call — rather than an empty one that answers "absent" |
| Loaded as its own startup step, before the lock is evaluated | `LOCAL_SECURITY_STATE_UNAVAILABLE` stops the launch there. The lock cannot be checked against a value nobody managed to read |
| Diagnostics carry the flag name, never the stored value | The same rule as the token store |

Enabling the lock now applies **only on a confirmed durable write**; a platform refusal leaves the previous durable state alone and surfaces a typed, recoverable error. Disabling is deliberately asymmetric: a disable that cannot be confirmed **retains the enabled state**, because the safe end of that failure is a lock the user must open rather than one that silently stopped existing. `KeyValueStore.writeBoolChecked` — a narrower fix attempted earlier — was deleted along with the old usage, so the ordinary preference store now offers no way to ask whether a write landed, which is the honest shape for a store that does not guarantee one.

Inherited from legacy findings MOB-03, MOB-04, MOB-06, MOB-07:

- **Sign-out clears by construction**, not by a hand-maintained registry. The legacy's registry has a documented blind spot, and imported statement PDFs survive sign-out in the app cache.
- **Biometric lock, idle timeout, and re-authentication on foreground** are built in Phase 4. The legacy has none of them.
- Profile fields encrypted server-side are **not** cached in plaintext on device.

### Application lock and the platform authenticator

`local_auth` is reached through exactly one adapter, `features/session_management/data/platform_local_authenticator.dart`, and the properties that matter are stated as invariants rather than left to the plugin: no biometric template, image, or derived representation is received, stored, or transmitted; no custom biometric cryptography exists; and **an unlock grants no session and never substitutes for signing in.**

The failure mapping is fail-closed. Cancellation and timeouts are cancellations; hardware absence, no enrolment, and no device credential are unavailability; lockout is its own reason — and the `default` arm maps to unavailable, because the plugin's error list is explicitly open and a code this build has never seen must not read as success. An unsupported platform gets an authenticator that never reports success at all.

Two Android build facts follow from that one plugin, and both are load-bearing rather than incidental. The host activity is a `FlutterFragmentActivity`, because `androidx.biometric` requires a `FragmentActivity` and otherwise answers every prompt with an error. And the launch and normal themes descend from `Theme.AppCompat`, because **below API 28** `androidx.biometric` draws its prompt with an AppCompat dialog that throws under a non-AppCompat theme. **The affected range is Android 8.1 and earlier — API 27 and below; at API 28 the framework's own prompt takes over and the requirement stops.** `minSdk` is 24, so API 24–27 ships inside that range and the theme is a shipped-configuration control, not a development convenience.

**Not verified at runtime.** See [`../phases/phase-04.md`](../phases/phase-04.md) — the prompt has been proven by static, compile-time, and artifact checks only, on no real device.

### Screen capture and the recording surface

`SensitiveScreen` covers its subtree whenever the application is not `resumed`, so the task switcher does not hold a snapshot of a recovery-code or session screen. It states its own limit rather than implying completeness: a full defence also sets `FLAG_SECURE` on the Android window and the iOS equivalent, and **neither is implemented.** Screenshots and screen recording are therefore not prevented.

**Certificate pinning is deliberately not in v1** (challenge C11, retained from Plan v1). The legacy has none either. This is a recorded acceptance with a named owner, not an oversight — it belongs in the risk-acceptance register.

### Android permissions: what Karar declares, and what the device actually sees

These are two different sets, and conflating them understates what the installed application asks for. [`AndroidManifest.xml`](../../apps/mobile/android/app/src/main/AndroidManifest.xml) declares **one** permission. The merged manifest inside a built artifact carries **four** — the manifest merger adds the rest from dependencies, so they cannot be removed by editing that file.

Verified by dumping the merged manifest out of a built APK (`aapt2 dump xmltree --file AndroidManifest.xml`) and cross-read against the merge blame report:

| Permission | Contributed by | Protection level | Why it is there |
|---|---|---|---|
| `android.permission.INTERNET` | Karar's own manifest | `normal` | The client exists to talk to the API. The Flutter template declares it only in the debug and profile source sets, which would leave a release build with no network access |
| `android.permission.USE_BIOMETRIC` | `local_auth_android` plugin module, and independently `androidx.biometric:biometric:1.1.0` | `normal` | The platform authenticator behind the application lock |
| `android.permission.USE_FINGERPRINT` | `androidx.biometric:biometric:1.1.0` | `normal` | Predecessor of `USE_BIOMETRIC`, deprecated at API 28 and carried for compatibility below it. minSdk is 24, so it covers a range that ships |
| `com.kararfinance.app[.<env suffix>].DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | `androidx.core:core:1.18.0`, which contributes both the `<permission>` and the `<uses-permission>` | `signature` | Defined **by this application**, not by the platform. Restricts androidx's runtime-registered receivers to code signed with the same key. Grants no platform capability; its name carries the environment's applicationId suffix |

`normal` means granted at install with no runtime prompt — no user-facing consent step exists for any of them, which is precisely why the review has to happen in the repository instead.

**Nothing else is requested**, by Karar or by any dependency: no location, contacts, storage, camera, phone state, or advertising identifier.

The **control** is not this table. It is the merged-manifest assertion in [`platform_hardening_test.dart`](../../apps/mobile/test/security/platform_hardening_test.dart), which reads a real build output and compares the platform-permission set **exactly**, so a dependency that starts contributing a new one fails the build rather than reaching a device unreviewed. A subset check would pass silently when a permission disappeared; an exact match makes both directions a finding. The application-defined permission is matched by shape rather than literal, because its name varies with the environment suffix.

### Android backup and data extraction

`android:allowBackup="false"` is the primary control and the one a reviewer or scanner looks for, but it is **not sufficient on its own**. Android documents that for an application running on and targeting API 31 or higher, `allowBackup="false"` disables cloud backup but does **not** disable device-to-device transfer; and that a backup mode whose section is missing from the rules resource is *fully enabled for all content*, not off. This build targets API 36, so both statements apply to what ships.

Session tokens live in Keystore-backed encrypted preferences, in the `sharedpref` domain. The wrapping key does not leave the Keystore, so a transferred copy would be ciphertext rather than usable credentials — but "the copy that left the device is useless" is a weaker claim than "no copy left the device", and only the second is a control.

All three attributes are therefore set: `allowBackup="false"` (all API levels), `fullBackupContent="false"` (the API 23–30 opt-out, redundant behind `allowBackup` and stated anyway), and `dataExtractionRules` pointing at a resource that is GENERATED per assembly by `GenerateDataExtractionRules` in [`app/build.gradle.kts`](../../apps/mobile/android/app/build.gradle.kts) rather than committed. Sections and domains are a product of two declared lists, so a section cannot silently omit a domain, and every exclusion carries `domain` and `path="."` — the whole-domain form. `path="./"` is NOT usable: lint reports `Subdirectories are not allowed` for the `database` and `sharedpref` domains and `FullBackupContent` is fatal, so it fails the release build; `"."` canonicalises to the same directory. `<cross-platform-transfer platform="ios">` carries `<platform-specific-params>`, whose `teamId` is a test-only sentinel for LOCAL and a configured Apple Team ID (`KARAR_IOS_TEAM_ID`) for any deployed profile — an assembly without one is refused. Generating the resource would have removed it from lint's view entirely, because `checkGeneratedSources` defaults to false, so it is set true; without that, a missing `platform` attribute passes `lintVitalRelease` silently. The resource, its packaging, the exclusions and the identity rules are asserted in the platform-hardening suite.

## 8. Generated SDK, never hand-written

OpenAPI-first (ADR-0009). The Dart client is generated from `packages/api-contracts` and committed. Hand-editing it is a CI failure.

The generator is first-party — [`apps/mobile/tool/generate_api_client.dart`](../../apps/mobile/tool/generate_api_client.dart), not `openapi-generator` — because the contract is hand-authored and schema-light in ways a general-purpose generator handles by inventing types. It emits two files, sorts everything it emits, and stamps each output with the contract version, a digest of the contract sources, and its own version, so a rerun is byte-identical and a stale output is visible in a diff.

**Three things it refuses to do rather than guess**, each a hard error naming the offending contract text: invent a response type for an operation the contract gives no schema (the operation returns a raw JSON map instead — inventing a type would be a claim the contract does not make); pick between two 2xx responses that both carry a schema; or decode a union whose discriminator is undeclared. At runtime the same discipline holds in the other direction: an **enum value this build cannot read decodes to `unrecognised` rather than throwing**, because a server may add one at any time and a client that threw would break on a deployment it did not ship with. That member is deliberately distinct from a contract-declared `UNKNOWN`: "nobody stated a value" is a fact the contract asserts, and "this build does not know this value" is a fact about the build, and a client that conflates them reports a stale binary as missing data — while an **unrecognised union branch is a hard contract violation**, because a union branch changes which fields exist and guessing would corrupt the read.

**Until Phase 5 the financial surface was read twice.** Beside the generated client sat a hand-written gateway spelling out fourteen `/financial/*` paths, a hand-written set of JSON readers, and twenty-seven tables restating vocabulary the contract already declared. It passed its tests, because both readings were written from the same contract on the same day. That is the failure mode this section exists to prevent, and the section claimed it was prevented. Both files are deleted; every financial request goes through the generated client, and every vocabulary is an exhaustive `switch` over a generated enum with no default arm, so a new contract member is a compile error at each site rather than a silent fallback at one.

Three executable rules keep it that way, in [`test/architecture/financial_contract_reading_test.dart`](../../apps/mobile/test/architecture/financial_contract_reading_test.dart): no spelled-out financial path outside the generated client, no hand-written response map-decoder, no vocabulary tabulated a second time. Each is proved against the real production tree rather than only a seeded copy, and each carries a counter-test showing it is not always-on — a rule that fires on everything is not a rule.

**Converging surfaced six things the generator could not express**, each a statement the contract makes that the client dropped. The costliest was request encoding: `toJson()` wrote every key, so a PATCH naming one field asked the platform to clear every field the caller never mentioned — optional properties are now omitted when absent, and optional-and-nullable ones carry an `Omittable` so *absent* and *explicitly null* stop being the same request. The others: a named scalar component was emitted as a field-less class whose `fromJson` cast a string to a map, so every response carrying one threw inside the generated decoder; enum and `DateTime` query parameters went on the wire through `toString()`; the unreadable-value fallback shared a member with a contract-declared `UNKNOWN`; a contract violation named only the operation, not the field; and an unmodelled request media type produced a silently body-less operation instead of saying so.

Identifier naming is where this bit. Every non-alphanumeric character in a wire value is now a word boundary; the earlier fixed list of separators meant the media type `text/markdown` kept its slash all the way into the emitted source and produced an enum member that would not compile. Three guards were added with the fix, because a naming rule that maps many values into one name is its own defect: a value that reduces to `unknown`, a value that cannot form a Dart identifier at all or collides with a reserved word, and two distinct wire values that reduce to the same member each fail generation with the contract text quoted.

**Drift detection is one-directional, and the direction matters.** `dart run tool/generate_api_client.dart --check` regenerates in memory and exits non-zero on any difference — it needs no git working tree and cannot be fooled by an uncommitted file — and it runs as its own CI step ahead of the mobile suite, because a drifted client turns every downstream failure into a red herring. A companion Dart test asserts the two generated files still declare themselves generated, still carry matching digests, and still document the `--check` command, so the CI step cannot quietly stop proving anything.

What that binds is **contract to client**, and for most of Phase 4 nothing bound **server to contract** — no test asserted that a response the NestJS application actually emits conforms to the OpenAPI document it was authored against. That gap is now partly closed, and the shape of what remains open matters more than the fact that something was added.

A runtime conformance suite drives the **composed application** — the real composition root, the modules it mounts, the guards, the global exception filter, the Fastify serializer, live PostgreSQL and live Redis — sends real HTTP, and validates the status, the `Content-Type`, and the returned bytes against the contract. It covers **82 of the 128 non-financial declared operation/status pairs**. Two ledgers that used to record known deviations now assert **empty**, which is what turns each into a gate rather than a note: no response carries an RFC 7807 body under `application/json` while the contract declares `application/problem+json`, and no operation describes its response in prose without a schema. The contract's three response-side `additionalProperties: false` sites are all exercised on real bodies — including the one whose closure is the only written reason `storageRef` does not ship to every subject.

**Phase 5 brought a second file rather than 27 more cases in the first.** The Phase 3 suite drives one boot through a long ordered scenario and asserts an exact ledger at the end; adding the financial operations to it would let one failure hide the rest. The financial file has its own ledger, asserted the same way, covering **139 of the 172 pairs the `/financial/*` fragments declare** — so the merged contract's **300 pairs across 55 paths** are 221 covered and 79 not. It is also the evidence for four claims beyond schema conformance: that the principal comes from the session and a request carrying `?userId=`, `?tenantId=` and `x-tenant-id` is answered byte-for-byte as one without them; that no ciphertext, key version, fingerprint, external reference or storage locator reaches the wire, checked against poison values seeded into the fixtures; that money is an exact minor-unit string, a booking date a calendar day and an instant offset-bearing; and that the CSV byte bound enforced on a real upload is the central one.

**The 46 uncovered non-financial pairs are not a backlog of the same kind.** Most are simply outside the mobile-consumed surface the suite was scoped to. Three are unreachable in process rather than skipped, and the suite's own header records why: two need a verification code or reset token that is stored as a digest and delivered only by e-mail, and one would require failing the shared rate-limit store underneath every other test in the run. The validator implements a deliberate subset of JSON Schema and **throws** on any keyword it does not implement, so a schema cannot quietly pass unchecked. The suite is infrastructure-gated: it skips when PostgreSQL and Redis are unreachable, so its figures describe a run with infrastructure present. Coverage and its limits are carried in [`../phases/phase-04.md`](../phases/phase-04.md).

**The capability scope narrows the surface automatically:** a tenant entitled to a subset of capabilities receives a client whose reachable endpoints are that subset. A white-label bank tenant with no Amanat entitlement gets no Amanat client code — the API surface narrows from the entitlement, not from a client-side flag. **Not built in Phase 4** — the generated client covers the whole contract today.

### The network layer has no interceptor stack

One request path, in [`core/networking/dio_api_transport.dart`](../../apps/mobile/lib/core/networking/dio_api_transport.dart), rather than a stack of interceptors whose registration order is the real specification. Four properties are worth naming because each was a decision:

- **Every failure is typed before it leaves the transport.** A `Failure` is sealed, so a `switch` over it is checked for exhaustiveness. Mapping is code-first and status-fallback: a problem document's machine-readable `code` decides, an unrecognised code falls through to the status, and an unrecognised status becomes an unexpected failure — never a success. Server-authored `title` and `detail` are parsed and then never logged and never branched on.
- **TLS is validated by the platform trust store, and no callback accepts an invalid certificate.** The rejecting callback is written out although it is the default, so a future "just for local testing" override is a visible line in a diff rather than an absent one. An invalid certificate is never retried and is reported as a dependency failure, so no screen can offer "continue anyway". **No certificate is pinned** — the recorded acceptance in §7 stands.
- **There is no "no timeout" option.** Three profiles exist and every request carries one, because a request that hangs forever holds the refresh barrier open.
- **Retry is bounded and only for replayable requests.** A request is replayable when its method is idempotent or it carries an idempotency key. A server-supplied `Retry-After` wins but is capped, so a hostile or mistaken header cannot park the application indefinitely.

### Single-flight refresh, and why it cannot loop

`TokenRefreshCoordinator` holds one in-flight future. Concurrent callers are handed that same future rather than queued, so many requests meeting an expired token produce exactly one refresh call. Four behaviours follow, and each is asserted:

1. **Staleness short-circuits.** A caller whose observed token has already been replaced takes the new one and issues nothing.
2. **A dead chain never reaches the network.** An expired refresh token ends the session locally, with no request.
3. **Terminal and transient failures are different.** A rejection, an authorization failure, or a contract violation ends the session and wipes the credential; offline, timeout, and rate-limit leave it in place for a retry. Collapsing the two would sign a person out over a lost connection.
4. **A refresh cannot trigger a refresh.** The refresh call is issued over a *separate raw transport* with no session manager, no refresh coordinator, and no retry policy attached. That makes a refresh storm structurally impossible rather than merely unlikely.

On a 401 the transport refreshes and replays **once**; a second 401 is authoritative. An unsafe request without an idempotency key is **not** replayed — the session is healthy again, and the caller reissues deliberately rather than having the transport send a write twice.

## 8a. Environment profiles and what a build refuses to produce

Four profiles — `LOCAL`, `DEV`, `STAGING`, `PRODUCTION` — compiled in as dart-defines (`KARAR_ENV`, `KARAR_API_BASE_URL`, plus version, build number and brand id). An unrecognised environment stops the build; it never quietly becomes `LOCAL`. **The client holds no secret**: any define whose *name* looks credential-shaped is a configuration violation reported by key name, never by value.

There are two guard layers, and they are not redundant — they answer different questions at different times.

**The build-time guard** decides whether a package may exist at all. On Android it lives in `android/app/build.gradle.kts`; on iOS in `ios/Scripts/verify_packaged_bundle.sh`, run as the Runner target's last build phase, after the plist is written and **before code signing**. For any environment other than `LOCAL` both refuse a build that has no endpoint, an endpoint that is not `https://`, one carrying credentials in its authority, one with an empty authority, or one whose host resolves only on a developer machine. The Android guard's nine refusal cases are exercised against real Gradle in CI, each asserted to fail *for the stated reason*, so the rules are proven behaviourally rather than by their presence in a file.

Three defects in this layer were found and fixed during Phase 4, and they are recorded rather than smoothed over because each shows a different failure mode:

- The guard originally ran **only when dart-defines were present**, which made a direct Gradle invocation a complete bypass. Absence is now the failure, not the exemption.
- Host extraction used `substringBefore(':')`, so a bracketed IPv6 literal yielded `[` and matched no rule — the IPv6 rules were **unreachable code that a source-presence test reported as present**, and a PRODUCTION build with a loopback endpoint succeeded. That is the general lesson: a presence check certifies that a rule is written, not that it runs.
- **iOS had no build-time endpoint guard at all** while Android refused the same build.

**The runtime guard** is `app/configuration/configuration_loader.dart`. It reports *every* violation it finds rather than the first, so a misconfigured build is fixed in one pass, and an invalid configuration routes the launch to a configuration-error screen instead of a sign-in screen it could not serve. Its loopback rule is exact string equality over four hosts plus two suffixes, which is **narrower than the build-time rule** — see the residual recorded in [`../phases/phase-04.md`](../phases/phase-04.md).

### The application identifier is per environment, on both platforms

Every iOS artifact carried the **production** bundle identifier until late in Phase 4, whatever environment it was compiled for, while Android had derived a per-environment identifier from the start. They now agree:

| Environment | Android `applicationId` | iOS `CFBundleIdentifier` |
|---|---|---|
| LOCAL | `com.kararfinance.app.local` | `com.kararfinance.app.local` |
| DEV | `com.kararfinance.app.dev` | `com.kararfinance.app.dev` |
| STAGING | `com.kararfinance.app.staging` | `com.kararfinance.app.staging` |
| PRODUCTION | `com.kararfinance.app` | `com.kararfinance.app` |

**Where the rule had to live was decided by a real constraint, not by preference.** The Flutter tool does forward dart-defines into the Xcode build — as a base64 CSV in `Generated.xcconfig` — but xcconfig has no string functions and cannot decode it. So the rule cannot live in an xcconfig, and it was put where a decoder already existed: the packaged-bundle build phase, which already decodes the compiled environment to gate the transport-security exception. That phase derives the expected identifier, refuses a `PRODUCT_BUNDLE_IDENTIFIER` that is not one of the four issued identifiers, narrows the packaged plist when the configuration default and the compiled environment disagree, and **re-reads the plist to confirm on every branch**. If a development team or provisioning profile is set and narrowing would be required, the **build fails** rather than producing an artifact whose identifier no longer matches its profile.

The xcconfig values are per-configuration defaults — Debug to LOCAL, Release and Profile to PRODUCTION — mirroring Android's `-Pkarar.env` default.

> **Consequence for everyday work: `flutter run` and Xcode-IDE builds now require `--dart-define=KARAR_ENV`.** A build told nothing about its environment is **refused**, rather than silently becoming a production-identified artifact. This is the intended failure and not a rough edge.

The identifiers are verified out of **real packaged artifacts** rather than out of the rules that produce them: CI reads the effective `CFBundleIdentifier` from each packaged plist across all four environments. The direct Android-artifact-to-iOS-artifact comparison covers one environment pair rather than four, for the reason recorded in [`../phases/phase-04.md`](../phases/phase-04.md).

**What this means for deployment: nothing is deployed, and the guards are why the report can say so plainly.** No endpoint exists for any environment, so the only packages this repository can build today are `LOCAL` ones. A DEV, STAGING or PRODUCTION build fails at configuration time.

## 9. Flavors and white-label

```
flutter build --flavor karar     # first-party
flutter build --flavor bank_x    # white-label
```

A flavor supplies: app name, bundle identifier, icons, splash, **design tokens**, legal document set, support channels, and API base. It supplies **no code**. If a white-label partner needs a code change, the theming contract is insufficient and gets fixed rather than forked.

**Honest scope note.** This is the *data plane*, and the legacy audit is direct evidence it is the larger half of white-label: the legacy built a complete control plane — tenants, contracts, branding, flags, domains, legal documents — and shipped a client that consumed none of it, concluding *"Qarar is not white-label ready."* Phase 11 budgets both planes. See [`plan-v2-deltas.md` D3](plan-v2-deltas.md).

## 10. State and offline

- State management was decided once, in Phase 4: **Riverpod, and nothing else.** No service locator, no `GetIt`, no static singleton, no global mutable instance. Three shapes are used and no others — `Provider` for configuration, foundations, repositories and use cases; `Notifier` for the screen controllers; `AsyncNotifier` for everything that loads. Exactly one `ChangeNotifier` exists, as the bridge that lets the router listen to the startup coordinator while the coordinator itself stays pure Dart. Mixed paradigms across features are a review failure.
- **A provider holding one organisation's answer must be able to EMPTY itself.** `ref.invalidate` reloads rather than discards: `AsyncLoading` and `AsyncError` both carry the previous value forward, so a screen keeps rendering the organisation a person just left for the whole reload window. Only a fresh `AsyncData` erases, and only from inside a notifier. So tenant-scoped state is registered through `app/lifecycle/tenant_data_scope.dart`, whose constructors are **bound on a notifier that can empty itself — a provider that cannot is a compile error to register**, not an omission somebody has to notice. Discard is reason-aware: a binding change empties and re-reads, a session end empties and issues nothing. The transport enforces the same boundary from the other side, refusing any answer whose session is no longer the signed-in one.
- **Read-only offline cache** for already-fetched data, so the app is usable on a poor connection. **Still not built** — no cache of any kind exists; every read goes to the API. That is now asserted rather than merely stated: `test/security/local_data_minimization_test.dart` fails if the application declares a database or writable-directory package, writes a file, or persists a preference outside the reviewed set (today, the locale and the theme).
- **No offline financial mutation queue.** A queued transaction edit that reconciles later is a correctness hazard the product does not need.
- **Empty state, never placeholder money.** A failed fetch shows an empty state. Inherited verbatim from the legacy, which states it as *"the product does not display invented figures."* Make it a platform rule, not a screen-level habit.

## 11. What the client never does

| | Why |
|---|---|
| Compute an authoritative financial figure | ADR-0007 |
| Persist or cache `SEALED` data | [`sealed-data.md`](sealed-data.md) |
| Decide capability availability locally | Deny-by-default is server-resolved |
| Fabricate a connection, account, or sync status | The legacy's worst surface. Never again |
| Format a number produced by a model | The model produces no numbers |
| Hold environment credentials | Control plane mediates (ADR-0021) |
| Show a figure it cannot attribute to a platform response | Empty state instead |

## 12. Client dependency governance

The registry-level vendor relationship (pub.dev, consumption only) is recorded in the [vendor and subprocessor register](../compliance/vendor-and-subprocessor-register.md); the pinning control itself is KAR-CTL-028 in the [control matrix](../compliance/control-matrix.md), owned by the Engineering Owner. Neither is a record of an *individual* client dependency, and the ones that carry credential material or contribute to the shipped manifest need one. This section is that record.

### The pinning rule

**Every direct dependency of [`apps/mobile/pubspec.yaml`](../../apps/mobile/pubspec.yaml) — main and dev, SDK packages excepted — carries an exact version. No caret, no range.** `pubspec.lock` is committed alongside it.

A range would not be a weaker version of the rule, it would be its absence: a republished upstream could change what builds without changing what was reviewed. Pinning a direct dependency does **not** pin its federated implementations or its transitive closure — those resolve on their own constraints and the lockfile is what records them. That is the lockfile's job, and it is not a reason to leave a direct dependency ranged. If a dependency is ever found where an exact pin is technically untenable, the range is stated next to it in the pubspec with the constraint that forces it. There is no such dependency today.

**The lockfile is enforced, not merely recorded.** `flutter pub get --enforce-lockfile` is what turns the lockfile from a record into a boundary: it fails on any resolution that would deviate, transitive dependencies included. Every Flutter step in both workflows uses it — the CI mobile, artifact, and iOS jobs and the Security workflow's mobile job — so the exact pins hold the direct set and the lockfile holds the transitive closure on the build machine. This closes the gap the section carried when the pinning rule first landed, where CI ran plain `flutter pub get`.

**The rule is asserted, not trusted to review.** [`test/security/dependency_pinning_test.dart`](../../apps/mobile/test/security/dependency_pinning_test.dart) parses the pubspec and fails on: any constraint that is not an exact `x.y.z`; any nested-block dependency (`git:`, `path:`, `hosted:`) that is not one of the three SDK-sourced entries — the bypass an exact-version regex alone would miss; a missing `flutter_secure_storage`, `local_auth`, `dio`, `go_router`, or `flutter_riverpod`, each named individually so *removing* one is also a failure; any `dependency_overrides` section; and a lockfile that does not record hosted sources with `sha256:` checksums. It opens with a guard that the parser found more than five dependencies at all, so a parsing regression cannot make the rest vacuous. The regression that motivated it was real: `local_auth` had drifted to a caret range with nothing failing.

### Dependencies with their own record

| Dependency | Owner | Review trigger | Why it is tracked here |
|---|---|---|---|
| `flutter_secure_storage` 11.0.0 | Security Owner | Any version change; any move in its `minCompileSdk` floor; a pub.dev retraction or publisher change; an SCA finding; each phase gate while it remains | The only place session tokens are written. See the provenance and `compileSdk` note below |
| `local_auth` 3.0.2 | Security Owner | Any version change; any change to the permissions its platform implementations contribute to the merged manifest; an SCA finding; each phase gate while it remains | Decides whether the application lock opens, and its Android implementation contributes two permissions to the shipped artifact (§7) |

#### `flutter_secure_storage` 11.0.0 — provenance

Checked against public pub.dev at Phase 4: it is the current stable release, published 2026-08-06, not retracted, and its archive `sha256` matches the committed lockfile exactly (`15e8c8fe…debace6`; the same digest is recorded by the local pub cache for the archive actually downloaded). A frozen resolution from a **clean** pub cache — `PUB_CACHE` pointed at an empty directory, `flutter pub get --enforce-lockfile` — succeeded, so the pin resolves from the registry rather than from a warm local cache.

#### Why the Android build compiles against SDK 37

This is a requirement of that one dependency, not a general upgrade, and the evidence is in the build rather than in anyone's recollection. **Independently re-verified at the Phase 4 close** against the published package archive in the pub cache rather than against this paragraph, because a dependency-driven pin that nobody re-reads becomes a preference nobody can justify:

- `flutter_secure_storage` 11.0.0 declares `compileSdk = 37` for its own Android library module (`android/build.gradle` in the published package).
- The Android Gradle Plugin propagates that as a floor for consumers: it writes `minCompileSdk=37` into the module's AAR metadata (`build/flutter_secure_storage/intermediates/aar_metadata/…/aar-metadata.properties` in a real build) and refuses to build a consuming module whose `compileSdk` is lower.
- Every other plugin module in this build declares a floor of 36 or less (`local_auth_android`, `shared_preferences_android`, `flutter_plugin_android_lifecycle` at 36; the JNI modules at 35). **37 is this dependency's floor and nothing else's.**

The consequence is recorded where it bites: `android/app/build.gradle.kts` pins `compileSdk = 37` rather than taking `flutter.compileSdkVersion`, and `android/gradle.properties` acknowledges AGP's "maximum recommended compile SDK is 36" warning instead of silencing it by downgrading the plugin that holds session tokens. `targetSdk` is untouched, so no new runtime behaviour is opted into, and `minSdk` stays at 24.

**Review trigger for the pin itself:** it is removed when `flutter_secure_storage`'s floor drops to the Flutter default, or when the Flutter default reaches 37 — whichever comes first. Until then it is a dependency-driven constraint, not a preference.
