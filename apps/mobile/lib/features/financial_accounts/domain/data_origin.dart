// PURE DART ONLY. See lib/README.md — domain purity.
//
// WHERE THE DATA CAME FROM, SAID HONESTLY.
//
// This is the ONLY place in the client where a source label is derived, and it
// is the reason "Connected" is unreachable rather than merely unused.
//
// The vocabulary below has four members and none of them asserts a live
// institution link. There is no `connected`, no `synced` and no `linked`
// member to return, so making the client claim a connection is not a matter of
// changing a condition — it requires inventing a new member and a new
// translated string, which is a reviewable change rather than a slip.
//
// FIVE THINGS THAT LOOK LIKE A CONNECTION AND ARE NOT, each of which this
// derivation refuses to read as one:
//
//   * an ISSUER ROW. The catalogue is reviewed reference data. That the
//     platform can spell a bank's name says nothing about whether it can
//     reach it, and this function never receives the issuer at all.
//   * a PROVIDER PROFILE or a `providerAccessStatus`. Its only permitted
//     value is NOT_IMPLEMENTED. A status that exists is not a status that
//     works.
//   * a SOURCE LINK whose status is LINKED. That is a link between a stored
//     source and an account inside this platform, not a link to an
//     institution. Its label says so.
//   * the EXTERNAL_PROVIDER vocabulary. The column can hold it; no path in
//     this platform can produce it. It maps to "not stated", never to a
//     connection, because a value nothing can write is not evidence of
//     anything.
//   * a CSV IMPORT. A person uploaded a file. That the file came from a bank
//     does not make the bank reachable.
//
// The rails are the last check: MANUAL and USER_FILE_UPLOAD are the only two
// this platform can run, and everything else is NOT_IMPLEMENTED. A rail whose
// availability is not EXECUTABLE never produces a label that implies data is
// flowing.
import 'package:meta/meta.dart';

import 'account_source_link.dart';
import 'financial_account.dart' show AccountOrigin;
import 'source_rail.dart';

/// How data reached this client, as one of four honest statements.
///
/// There is deliberately no member meaning "connected", "synced" or "live".
enum DataOrigin {
  /// A person typed it.
  manuallyAdded,

  /// It came out of a statement file a person uploaded.
  importedFromStatement,

  /// The only automatic route that exists is a file a person uploads.
  fileImportOnly,

  /// The platform did not say, or said something this build cannot honestly
  /// render. Never softened into one of the three above.
  notStated,
}

/// Whether a data origin asserts that this platform can reach an institution.
///
/// It is a constant `false`, and it is written as a function so a test can
/// assert it over the whole vocabulary rather than over the members someone
/// remembered. No issuer exposes an interface to this platform and no
/// credential of any kind is stored (ADR-0028).
bool originAssertsLiveInstitutionLink(DataOrigin origin) => false;

/// Derives the label for an ACCOUNT from its origin alone.
///
/// The issuer is not a parameter. It cannot be: an issuer's presence in a
/// reviewed catalogue is not evidence that anything connects to it, and a
/// function that could see the issuer is a function that could be changed to
/// read one.
DataOrigin dataOriginOfAccount(AccountOrigin origin) => switch (origin) {
      AccountOrigin.manual => DataOrigin.manuallyAdded,
      AccountOrigin.csv => DataOrigin.importedFromStatement,
      // Unreachable by construction on the platform side, and not treated as a
      // connection here either. See the note at the top of this file.
      AccountOrigin.externalProvider => DataOrigin.notStated,
      AccountOrigin.unrecognised => DataOrigin.notStated,
    };

/// Derives the label for a stored FIGURE from the rail it arrived on.
///
/// [availability] is required rather than optional: a rail this platform
/// cannot run reports nothing, whatever its name suggests.
DataOrigin dataOriginOfSourceKind(SourceKind kind, RailAvailability availability) {
  if (availability != RailAvailability.executable) {
    return DataOrigin.notStated;
  }
  return switch (kind) {
    SourceKind.manual => DataOrigin.manuallyAdded,
    SourceKind.csv => DataOrigin.importedFromStatement,
    SourceKind.externalProvider => DataOrigin.notStated,
    SourceKind.unrecognised => DataOrigin.notStated,
  };
}

/// Derives the label for a SOURCE LINK from its rail and that rail's
/// availability.
///
/// The link's own status is not consulted. LINKED means a stored source is
/// attached to an account inside this platform; reading it as a connection to
/// an institution is exactly the mistake this file exists to prevent.
DataOrigin dataOriginOfRail(ConnectionRail rail, RailAvailability availability) {
  if (availability != RailAvailability.executable) {
    return DataOrigin.notStated;
  }
  return switch (rail) {
    ConnectionRail.manual => DataOrigin.manuallyAdded,
    ConnectionRail.userFileUpload => DataOrigin.fileImportOnly,
    // Every remaining rail is NOT_IMPLEMENTED on the platform, so this arm is
    // unreachable through a well-formed response. It is written out rather
    // than defaulted so that a rail becoming executable is a compile-time
    // decision here instead of a silent relabelling.
    ConnectionRail.openFinanceApi ||
    ConnectionRail.directBankOrWalletApi ||
    ConnectionRail.licensedAggregatorApi ||
    ConnectionRail.hostToHostSftp ||
    ConnectionRail.iso20022File ||
    ConnectionRail.swiftMtFile ||
    ConnectionRail.ofxQfxFile ||
    ConnectionRail.qifFile ||
    ConnectionRail.pdfStatement ||
    ConnectionRail.secureEmailStatement ||
    ConnectionRail.deviceSignal ||
    ConnectionRail.unrecognised =>
      DataOrigin.notStated,
  };
}

/// When this platform last finished taking data in, as a state.
@immutable
sealed class SourceFreshness {
  const SourceFreshness();
}

/// An import completed at this instant. This is the only state that carries a
/// "last synchronised" moment, and it comes from
/// `observation.lastSuccessfulImportAt` — never from "we saw the source", and
/// never from `updatedAt`.
final class LastSynchronisedAt extends SourceFreshness {
  const LastSynchronisedAt(this.at);

  final DateTime at;

  @override
  String toString() => 'LastSynchronisedAt()';
}

/// A source is attached and no import has ever finished. Distinct from
/// [NoSourceObserved]: something is there, it has just never delivered.
final class NeverImported extends SourceFreshness {
  const NeverImported();

  @override
  String toString() => 'NeverImported()';
}

/// No source feeds this account at all.
final class NoSourceObserved extends SourceFreshness {
  const NoSourceObserved();

  @override
  String toString() => 'NoSourceObserved()';
}

/// The freshness of an account, from every source that feeds it.
///
/// The most recent successful import across sources wins, because that is the
/// only moment about which the sentence "data last arrived" is true.
SourceFreshness freshnessOf(Iterable<AccountSourceLink> links) {
  DateTime? latest;
  var sawAnySource = false;
  for (final link in links) {
    sawAnySource = true;
    final imported = link.observation.lastSuccessfulImportAt;
    if (imported == null) {
      continue;
    }
    if (latest == null || imported.isAfter(latest)) {
      latest = imported;
    }
  }
  if (!sawAnySource) {
    return const NoSourceObserved();
  }
  if (latest == null) {
    return const NeverImported();
  }
  return LastSynchronisedAt(latest);
}

/// The origins of every source feeding an account, in vocabulary order and
/// without repeats, so the summary reads the same for two accounts fed the
/// same way.
List<DataOrigin> sourceOriginsOf(Iterable<AccountSourceLink> links) {
  final seen = <DataOrigin>{};
  for (final link in links) {
    seen.add(dataOriginOfRail(link.rail, link.availability));
  }
  return <DataOrigin>[
    for (final origin in DataOrigin.values)
      if (seen.contains(origin)) origin,
  ];
}
