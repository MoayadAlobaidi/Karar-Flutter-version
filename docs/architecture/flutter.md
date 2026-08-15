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
