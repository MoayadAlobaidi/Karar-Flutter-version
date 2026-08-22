# provider-capabilities — Infrastructure layer

One adapter, `ReviewedRegistryProfileSource`, implementing the one port the application layer declares.

**It reads a frozen constant.** No ORM, no client, no HTTP, no filesystem — reviewed configuration is code, so the store behind the port is this repository. The class lives here because it satisfies a declared port, not because it reaches anything.

It answers `null` for every query, because `REVIEWED_CAPABILITY_PROFILES` is empty and ships empty. That is the truthful answer, and having the adapter now means the composition and the not-reviewed path are exercised before there is anything to get wrong about them.

**This layer names no vendor**, which is unusual for an infrastructure layer and follows from the same rule as everywhere else in the module: no provider is integrated, none exposes an interface to Karar, and there is nothing here to name one with.

## Import rules

May import this module's `application/` ports and `domain/`. **Never imported by either.** Cross-module imports resolve through another module's `public-api.ts` only.
