// PURE DART ONLY. See lib/README.md — domain purity.
//
// WHEN DATA LAST ARRIVED — AND THE FOUR THINGS THAT ARE NOT THAT.
//
// "Last updated" is the sentence on this surface most likely to be read as
// something it is not. A person who sees a recent date beside a source concludes
// that the platform has recently been in touch with their bank. It has not:
// this platform contacts no institution, and every date here is a record of
// something the PERSON did.
//
// So exactly one field may produce an arrival instant, and this file is the
// only place that reads it:
//
//   * `observation.lastSuccessfulImportAt` — data actually landed. This is the
//     one moment about which "data arrived" is true;
//
// and four fields may not, each of which would produce a plausible, wrong date:
//
//   * `observation.lastObservedAt` — the platform SAW the source. Seeing is not
//     receiving, and a staged upload that failed to parse still moves it;
//   * `historyCoverage.end` — the last DAY the supplied data covers. A
//     statement covering up to March says nothing about when it was supplied
//     or whether anything since exists. Coverage is a property of the data, not
//     of the delivery;
//   * `updatedAt` — the row changed. Renaming a connection would become a
//     freshness claim;
//   * `subjectConfirmedAt` — the person answered a linking question.
//
// [arrivalOf] therefore takes the observation and NOT the link, so the three
// other instants and the coverage range are not in scope at the point the
// decision is made. A future edit cannot reach for them by accident; it would
// have to change the signature first.
import 'package:meta/meta.dart';

import '../../financial_accounts/domain/account_source_link.dart';

/// Whether data has ever arrived from one source, and when.
@immutable
sealed class SourceArrival {
  const SourceArrival();
}

/// Data the person supplied landed at this instant.
///
/// The instant is `lastSuccessfulImportAt` verbatim. It is never approximated,
/// never substituted from a nearby field, and never rounded to a coverage day.
final class DataArrivedAt extends SourceArrival {
  const DataArrivedAt(this.at);

  final DateTime at;

  @override
  bool operator ==(Object other) => other is DataArrivedAt && other.at == at;

  @override
  int get hashCode => at.hashCode;

  @override
  String toString() => 'DataArrivedAt()';
}

/// The source exists and nothing has ever arrived through it.
///
/// A real answer rather than a missing one, and the screen says so in words. A
/// blank where a date belongs reads as a rendering fault; "nothing has arrived
/// yet" reads as the truth it is.
final class NoDataHasArrived extends SourceArrival {
  const NoDataHasArrived();

  @override
  bool operator ==(Object other) => other is NoDataHasArrived;

  @override
  int get hashCode => 0;

  @override
  String toString() => 'NoDataHasArrived()';
}

/// The arrival for one source, from its observation and from nothing else.
///
/// See the header for the four instants this deliberately cannot see.
SourceArrival arrivalOf(SourceObservation observation) {
  final DateTime? landed = observation.lastSuccessfulImportAt;
  if (landed == null) {
    return const NoDataHasArrived();
  }
  return DataArrivedAt(landed);
}
