# Flutter Client Architecture

**ADRs:** 0007, 0009 · **Phase:** 4 (foundation), 9 (features), 11 (flavors), 15 (embedded)

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

```
apps/mobile/
├── lib/
│   ├── app/              — bootstrap, DI, routing, flavors
│   ├── core/
│   │   ├── network/      — generated SDK client, interceptors
│   │   ├── storage/      — secure storage only for CONFIDENTIAL+
│   │   ├── capability/   — capability state, gating
│   │   ├── localization/ — ar/en, RTL
│   │   └── theme/        — design tokens, brand resolution
│   ├── design_system/    — primitives, never feature-specific
│   ├── features/
│   │   ├── auth/ transactions/ budgets/ goals/ insights/
│   │   ├── zakat/
│   │   └── amanat/       — added with zero shell changes
│   └── shared/
└── test/
```

**Adding a capability adds a folder under `features/` and a route registration. Nothing else.** If a new capability requires editing the shell, the seam is wrong — see [`extension-pattern.md`](extension-pattern.md).

Each feature folder mirrors the backend's layering in spirit: `presentation/` (widgets, state), `application/` (view models), `data/` (repository over the generated SDK). Features do not import each other; shared behaviour goes to `shared/` or `design_system/`.

## 4. Capability-aware navigation

The client does not decide what exists. **The platform tells it**, and the client renders that answer honestly.

```dart
sealed class CapabilityState {
  const factory CapabilityState.available() = Available;
  const factory CapabilityState.beta() = Beta;
  const factory CapabilityState.consentRequired(ConsentRef ref) = ConsentRequired;
  const factory CapabilityState.entitlementMissing(PlanRef plan) = EntitlementMissing;
  const factory CapabilityState.pendingProvider() = PendingProvider;
  const factory CapabilityState.unavailable(DenialReason reason) = Unavailable;
}
```

Three rules:

1. **Deny by default.** An unknown capability renders as absent, never as available.
2. **A hidden capability is explainable.** Every denial carries a machine-readable reason. Where the reason is actionable (`consentRequired`, `entitlementMissing`) the client offers the action. Where it is not (`unavailable` for legal reasons) the capability is **absent entirely** — not greyed out with a teasing label.
3. **Routes are gated at the router**, not inside the screen. A deep link to an unavailable capability resolves to not-found, so an unavailable capability is unreachable rather than merely unlisted.

Amanat, when unavailable, is invisible: no nav entry, no route, no empty state. Plan §6.3 item 10.

## 5. Arabic and RTL are first-class from Phase 4

Not a late localization pass. The legacy shipped EN/AR with RTL and *still* found untranslated category names, residual English strings, and RTL alignment defects — because retrofitting bidirectional layout finds every hardcoded `EdgeInsets.only(left:)` one screen at a time.

| Rule | Enforcement |
|---|---|
| No hardcoded user-facing strings | Lint rule; all text via ARB keys |
| Directional insets only — `start`/`end`, never `left`/`right` | Lint rule |
| Every screen has an RTL golden test | CI |
| Arabic is a first-class test locale, not an afterthought | CI runs both locales |

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

Inherited from legacy findings MOB-03, MOB-04, MOB-06, MOB-07:

- **Sign-out clears by construction**, not by a hand-maintained registry. The legacy's registry has a documented blind spot, and imported statement PDFs survive sign-out in the app cache.
- **Biometric lock, idle timeout, and re-authentication on foreground** are built in Phase 4. The legacy has none of them.
- Profile fields encrypted server-side are **not** cached in plaintext on device.

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

All three attributes are therefore set: `allowBackup="false"` (all API levels), `fullBackupContent="false"` (the API 23–30 opt-out, redundant behind `allowBackup` and stated anyway), and `dataExtractionRules` pointing at [`data_extraction_rules.xml`](../../apps/mobile/android/app/src/main/res/xml/data_extraction_rules.xml), which declares every extraction mode and excludes every documented domain from each. The rules resource, its packaging into the APK, and the exclusion of all nine domains are asserted in the platform-hardening suite.

## 8. Generated SDK, never hand-written

OpenAPI-first (ADR-0009). The Dart client is generated from `packages/api-contracts` and committed. Hand-editing it is a CI failure.

**The capability scope narrows the surface automatically:** a tenant entitled to a subset of capabilities receives a client whose reachable endpoints are that subset. A white-label bank tenant with no Amanat entitlement gets no Amanat client code — the API surface narrows from the entitlement, not from a client-side flag.

## 9. Flavors and white-label

```
flutter build --flavor karar     # first-party
flutter build --flavor bank_x    # white-label
```

A flavor supplies: app name, bundle identifier, icons, splash, **design tokens**, legal document set, support channels, and API base. It supplies **no code**. If a white-label partner needs a code change, the theming contract is insufficient and gets fixed rather than forked.

**Honest scope note.** This is the *data plane*, and the legacy audit is direct evidence it is the larger half of white-label: the legacy built a complete control plane — tenants, contracts, branding, flags, domains, legal documents — and shipped a client that consumed none of it, concluding *"Qarar is not white-label ready."* Phase 11 budgets both planes. See [`plan-v2-deltas.md` D3](plan-v2-deltas.md).

## 10. State and offline

- State management is decided once, in Phase 4, and applied uniformly. Mixed paradigms across features are a review failure.
- **Read-only offline cache** for already-fetched data, so the app is usable on a poor connection.
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

**Known gap, stated rather than implied.** `flutter pub get --enforce-lockfile` is what turns the lockfile from a record into an enforced boundary: it fails on any resolution that would deviate, transitive dependencies included. It resolves clean against the committed lockfile. **CI does not use it** — the mobile jobs run plain `flutter pub get` — so today the exact pins hold the direct set still while the transitive closure is recorded but not enforced on the build machine. Closing that is a CI change, not a pubspec one.

### Dependencies with their own record

| Dependency | Owner | Review trigger | Why it is tracked here |
|---|---|---|---|
| `flutter_secure_storage` 11.0.0 | Security Owner | Any version change; any move in its `minCompileSdk` floor; a pub.dev retraction or publisher change; an SCA finding; each phase gate while it remains | The only place session tokens are written. See the provenance and `compileSdk` note below |
| `local_auth` 3.0.2 | Security Owner | Any version change; any change to the permissions its platform implementations contribute to the merged manifest; an SCA finding; each phase gate while it remains | Decides whether the application lock opens, and its Android implementation contributes two permissions to the shipped artifact (§7) |

#### `flutter_secure_storage` 11.0.0 — provenance

Checked against public pub.dev at Phase 4: it is the current stable release, published 2026-08-06, not retracted, and its archive `sha256` matches the committed lockfile exactly (`15e8c8fe…debace6`; the same digest is recorded by the local pub cache for the archive actually downloaded). A frozen resolution from a **clean** pub cache — `PUB_CACHE` pointed at an empty directory, `flutter pub get --enforce-lockfile` — succeeded, so the pin resolves from the registry rather than from a warm local cache.

#### Why the Android build compiles against SDK 37

This is a requirement of that one dependency, not a general upgrade, and the evidence is in the build rather than in anyone's recollection:

- `flutter_secure_storage` 11.0.0 declares `compileSdk = 37` for its own Android library module (`android/build.gradle` in the published package).
- The Android Gradle Plugin propagates that as a floor for consumers: it writes `minCompileSdk=37` into the module's AAR metadata (`build/flutter_secure_storage/intermediates/aar_metadata/…/aar-metadata.properties` in a real build) and refuses to build a consuming module whose `compileSdk` is lower.
- Every other plugin module in this build declares a floor of 36 or less (`local_auth_android`, `shared_preferences_android`, `flutter_plugin_android_lifecycle` at 36; the JNI modules at 35). **37 is this dependency's floor and nothing else's.**

The consequence is recorded where it bites: `android/app/build.gradle.kts` pins `compileSdk = 37` rather than taking `flutter.compileSdkVersion`, and `android/gradle.properties` acknowledges AGP's "maximum recommended compile SDK is 36" warning instead of silencing it by downgrading the plugin that holds session tokens. `targetSdk` is untouched, so no new runtime behaviour is opted into, and `minSdk` stays at 24.

**Review trigger for the pin itself:** it is removed when `flutter_secure_storage`'s floor drops to the Flutter default, or when the Flutter default reaches 37 — whichever comes first. Until then it is a dependency-driven constraint, not a preference.
