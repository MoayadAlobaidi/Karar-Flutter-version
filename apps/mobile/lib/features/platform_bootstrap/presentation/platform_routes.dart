// Protected routes owned by the platform surface.
//
// These are siblings of the protected root, not children of a gate route, so
// the single redirect in `app/routing/app_router.dart` leaves them alone once
// startup is READY. No route here takes a tenant, an entity or a jurisdiction
// as a parameter: every one of those is read from the platform's answer, and a
// path segment would be a second, untrusted source for it.
abstract final class PlatformRoutes {
  /// The contracting entity and the documents that apply.
  static const String legal = '/legal';

  /// Jurisdiction status and self-declaration.
  static const String jurisdiction = '/jurisdiction';
}
