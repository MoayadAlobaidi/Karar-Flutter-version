# Flutter client

The consumer application. **Performs no authoritative financial math** (ADR-0007) — it renders values the platform computed.

Adding a capability adds a folder under `lib/features/` and a route. **Nothing else.** If a capability requires editing the shell, the seam is wrong.

## Import rules

Consumes the generated Dart SDK. Never talks to the database.

## Run

```
flutter pub get
flutter run
flutter test
```

---

_Phase 1: placeholder shell only (`lib/main.dart`). No features, no SDK yet._
