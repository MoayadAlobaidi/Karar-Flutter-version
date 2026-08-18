# Client architecture

Feature-first Clean Architecture. This file is the contract every workstream
builds against; it describes rules, not aspirations, and the ones marked
**MUST** are enforced by tests, by the analyzer, or by both.

```
lib/
  main.dart                  entrypoint, one line
  app/                       the shell: how the application starts and navigates
    bootstrap/               binding, error handlers, composition root assembly
    configuration/           build/runtime configuration and its validation
    dependency_injection/    Riverpod providers — the ONLY composition root
    lifecycle/               the startup state machine
    routing/                 routes and the single redirect
  core/                      cross-cutting foundation, feature-agnostic
    errors/                  Failure taxonomy and Result
    localization/            locale/theme preference (no message catalogues)
    logging/                 redacting logger; the only diagnostic sink
    networking/              transport, RFC 7807 mapping, refresh coordinator
      generated/             GENERATED API client — never hand-edited
    security/                secure storage, session, application lock
    storage/                 non-sensitive preferences
    utilities/               clock, cancellation, correlation ids
  features/<feature>/        product features (see below)
  shared/                    design system and shared widgets
  l10n/                      ARB sources and generated message catalogues
```

## Layers inside a feature

```
features/<feature>/
  domain/          entities, value objects, use cases, repository PORTS, failures
  data/            DTO mapping, repository IMPLEMENTATIONS, data sources
  presentation/    Riverpod providers, immutable view state, widgets
```

Dependencies point inward only: `presentation → domain`, `data → domain`.
`domain` depends on nothing but pure Dart.

## Domain purity — the rule everything else rests on

A file under `features/*/domain/` **MUST NOT** import any of:

- `package:flutter/*`
- `package:flutter_riverpod/*`, `package:riverpod/*`
- `package:go_router/*`
- `package:dio/*`
- `flutter_secure_storage`, `shared_preferences`, biometric or platform-channel
  plugins
- `core/networking/generated/*` (generated DTOs)
- `dart:convert`, `dart:io`, `dart:ui`, or any JSON/serialisation library
- any analytics, crash-reporting, advertising or fingerprinting package

Permitted: `dart:core`, `dart:async`, `dart:math`, `package:meta/meta.dart`,
`core/errors/*`, `core/utilities/*`.

Practically: a use case takes a repository port and returns
`Future<Result<T>>`. It never sees a status code, a DTO, a `BuildContext`, or a
`Ref`.

## The conventions

**Typed failures.** Every fallible operation returns
`Result<T>` (`core/errors/result.dart`) — `Success<T>` or `Failed<T>` carrying a
`Failure` (`core/errors/failure.dart`). `Failure` is sealed, so a `switch` over
it is checked for exhaustiveness. Expected outcomes are values, never
exceptions. `ApiException` exists only inside the data layer.

**Mapping a DTO.** In the repository implementation, and nowhere else:

```dart
Future<Result<Thing>> load() async {
  try {
    final dto = await _client.getThing();
    return Success<Thing>(_toDomain(dto));
  } on ApiException catch (exception) {
    return Failed<Thing>(exception.failure);
  } on FormatException {
    return const Failed<Thing>(ContractViolationFailure(location: 'thing'));
  } on TypeError {
    return const Failed<Thing>(ContractViolationFailure(location: 'thing'));
  }
}
```

The `FormatException` and `TypeError` arms are not optional: a payload the
generated decoder cannot classify must become a typed failure, so a server that
adds a union branch degrades the client instead of crashing it. Worked example:
`app/lifecycle/api_bootstrap_gateway.dart`.

**Obtaining a use case.** Providers live in `presentation/`, never in
`domain/`:

```dart
final thingRepositoryProvider = Provider<ThingRepository>(
  (Ref ref) => ApiThingRepository(ref.watch(apiClientProvider)),
);
final loadThingProvider = Provider<LoadThing>(
  (Ref ref) => LoadThing(ref.watch(thingRepositoryProvider)),
);
```

There is no service locator and no global singleton. Everything reaches
everything else through `ref`.

**Adding a route.** Do not edit `app/routing/*`. Override
`featureRoutesProvider` (protected routes),
`startupScreenOverridesProvider` (a real screen for a startup gate state), or
`homeScreenBuilderProvider`. There is exactly ONE redirect in the application,
in `app/routing/app_router.dart`, driven by the startup coordinator; adding a
second reintroduces the bug the coordinator exists to prevent.

**Startup states.** `app/lifecycle/startup_state.dart`:
`CONFIG_LOADING`, `CONFIG_INVALID`, `APP_LOCKED`, `SESSION_RESTORING`,
`UNAUTHENTICATED`, `SESSION_EXPIRED`, `MFA_CHALLENGE_REQUIRED`,
`EMAIL_VERIFICATION_REQUIRED`, `TENANT_SELECTION_REQUIRED`,
`BOOTSTRAP_LOADING`, `BOOTSTRAP_UNAVAILABLE`, `READY`. Each maps to exactly one
route and declares one recovery action. Protected content renders in `READY`
and nowhere else. A feature **MUST NOT** decide any of this for itself.

**View state** is immutable. Rebuild it; never mutate it.

**User-facing text.** Every message a person can read lives in `l10n/arb/app_en.arb` and `app_ar.arb`, with a `description` on the English entry, and reaches a widget through the generated `AppLocalizations`. A feature **MUST NOT** carry its own string catalogue — six of them existed, holding 335 messages outside every localization gate the project runs, and they were consolidated for exactly that reason. A literal passed to `Text()` fails `test/l10n/localization_lint_test.dart`, as does any hardcoded `left`/`right` layout: Arabic reads right to left, so a left inset is a defect, not a style choice.

**Golden baselines.** Do not add one under `test/features/` — a test enforces this, and the reason is disclosure rather than tidiness: a golden is a committed image of whatever was on screen, and the MFA setup key, the recovery codes and the session list must never end up in one. The four design-system baselines live under `test/shared/`, are not CI-enforced, and are explained in `docs/architecture/flutter.md` §5.

## Security rules

- Tokens live in platform secure storage only (`core/security`). Never in
  shared preferences, a file, SQLite, a log, or the clipboard.
- `PreferenceKey` refuses a credential-shaped key name at construction.
- A secure-storage failure fails CLOSED: it is a `Failed`, never an empty
  store, and the application behaves as though no credential exists.
- Never log an authorization header, a cookie, a token, a password, a
  verification or reset code, an MFA secret, a recovery code, consent evidence,
  or a request/response body. `core/logging/redaction.dart` is the policy;
  `print` is banned by the analyzer.
- Flutter holds only non-secret configuration: API base URL, environment
  identifier, public build metadata, public brand identifier. Never a database
  credential, service-account file, API secret, KMS reference, private key,
  signing secret, or provider credential.
- No analytics, crash-reporting, advertising, or fingerprinting SDK.
- No fabricated financial data anywhere — not in a screen, not in a fixture,
  not in a test.

## Generated API client

`core/networking/generated/` is produced from
`packages/api-contracts/openapi/openapi.yaml` and is **never hand-edited**.

```
cd apps/mobile && dart run tool/generate_api_client.dart          # regenerate
cd apps/mobile && dart run tool/generate_api_client.dart --check  # drift check
```

Generated DTOs stay in the data layer. Change the contract, or change
`tool/generate_api_client.dart`; never the output.
