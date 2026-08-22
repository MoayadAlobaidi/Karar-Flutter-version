// PURE DART ONLY. See lib/README.md — domain purity.
//
// THE RAIL VOCABULARY, IN ONE PLACE.
//
// Balances, transactions and source links all say which rail a stored fact
// arrived on and whether this platform can run that rail. They say it with the
// same two vocabularies, so the vocabularies live here and every feature reads
// the one definition — two readings of "which rails work" is how one screen
// ends up claiming something the next one denies.
//
// The pair is never separated. A rail NAME describes the world; only
// [RailAvailability] says whether this platform can act on it, and every
// rail-bearing response carries both.

/// The rail a stored figure or record arrived on.
///
/// EXTERNAL_PROVIDER is in the vocabulary because the column can hold it. No
/// path in this platform produces it, no issuer exposes an interface to this
/// platform, and it is never read as a connection — see `data_origin.dart`.
enum SourceKind { manual, csv, externalProvider, unrecognised }

/// Whether this platform can actually run the rail today.
enum RailAvailability {
  /// MANUAL and USER_FILE_UPLOAD, and nothing else.
  executable,

  notImplemented,

  unrecognised,
}
