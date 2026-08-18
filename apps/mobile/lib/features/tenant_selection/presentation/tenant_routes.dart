// Protected routes owned by the tenancy feature.
//
// The path deliberately does NOT match the `/tenant-selection` gate route: the
// gate belongs to the startup coordinator, and a protected route that shared
// its prefix would be swallowed by the single redirect.
abstract final class TenantRoutes {
  /// The bound organisation, and any switch the platform offers.
  static const String organisation = '/organisation';
}
