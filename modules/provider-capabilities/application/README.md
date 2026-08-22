# provider-capabilities — Application layer

One use case, `DescribeProviderCapabilities`, and the one **port** it declares.

Declares the interface it needs. **Never names an implementation.** Returns `Result`.

`ReviewedProfileCataloguePort` is deliberately SYNCHRONOUS. Every other port in this repository returns a `Promise` because every other port reaches a store; an async signature here would invite an implementation that fetches, and fetching an issuer's capabilities is the one thing this module exists to never do.

There is no principal and no tenant on anything in this layer. A capability profile is `NON_PERSONAL` reference data about an organisation, exactly as `public.institutions` and `public.institution_markets` are, so there is no subject predicate to authorize against and a principal parameter would suggest a boundary that does not exist.

Nothing in this layer branches on which issuer a profile describes, and nothing can: the profile type has no field that could identify one to a human.

## Import rules

May import this module's `domain/`, its own ports, and `shared-kernel`. **Never `infrastructure/`.**
