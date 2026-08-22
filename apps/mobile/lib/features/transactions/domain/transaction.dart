// PURE DART ONLY. See lib/README.md — domain purity.
//
// ONE OF THE CALLER'S OWN TRANSACTIONS.
//
// `amount` is signed under the platform's canonical convention and
// `direction` restates it in words, so a screen renders an honest arrow
// without doing arithmetic on the sign. A person ENTERING an amount supplies a
// magnitude and a direction instead (`MoneyEntry`): a client that got the sign
// backwards would write a wrong financial record that looks exactly like a
// right one.
//
// `bookingDate` and `valueDate` are CALENDAR DAYS. They stay `CalendarDay` all
// the way to the widget — see `financial_accounts/domain/calendar_day.dart`
// for why turning one into a local-midnight `DateTime` moves a statement line
// across a month boundary.
//
// DELIBERATELY ABSENT, and to stay absent: the dedup fingerprint, its version
// and the occurrence ordinal; the import reference and the source row
// reference; any ciphertext or key version; and any category confidence —
// there is no score in this platform and none may be invented for display.
import 'package:meta/meta.dart';

import '../../financial_accounts/domain/calendar_day.dart';
import '../../financial_accounts/domain/money.dart';
import '../../financial_accounts/domain/source_rail.dart';

/// The transaction's own lifecycle.
enum TransactionStatus { posted, voided, unrecognised }

/// What the SOURCE itself said, before any mapping.
enum SourceDirection { debit, credit, notStated, unrecognised }

/// How the source's statement was turned into the canonical sign.
enum DirectionMapping {
  manualEntry,
  sourceDirectionWord,
  sourceSignedAmount,
  sourceSignedAmountInverted,
  unrecognised,
}

/// Who or what recorded a revision.
enum RevisionAttribution { sourceImport, manualEntry, userInput, unrecognised }

/// A field a correction may change.
enum RevisableField {
  amount,
  bookingDate,
  valueDate,
  merchant,
  description,
  note,
  status,
  unrecognised,
}

/// One transaction.
@immutable
final class Transaction {
  const Transaction({
    required this.transactionId,
    required this.accountId,
    required this.amount,
    required this.direction,
    required this.bookingDate,
    required this.valueDate,
    required this.eventOccurredAt,
    required this.sourceTimezone,
    required this.merchant,
    required this.description,
    required this.note,
    required this.originalAmount,
    required this.sourceKind,
    required this.availability,
    required this.status,
    required this.createdAt,
    required this.version,
  });

  final String transactionId;
  final String accountId;

  /// Signed, under the platform's convention. Never re-signed by this client.
  final Money amount;

  final MoneyDirection direction;

  /// The day the institution booked it. A calendar day, never an instant.
  final CalendarDay bookingDate;

  final CalendarDay? valueDate;

  /// A true instant, present only when the source stated one — and meaningful
  /// only with [sourceTimezone], which the platform requires alongside it.
  final DateTime? eventOccurredAt;

  final String? sourceTimezone;
  final String? merchant;
  final String description;
  final String? note;

  /// The amount as the source stated it, when its currency differed. It is
  /// shown BESIDE the booked amount and never instead of it: the two are in
  /// different currencies, and there is no rate on this surface to relate
  /// them.
  final Money? originalAmount;

  /// The rail this record arrived on.
  final SourceKind sourceKind;

  /// Whether this platform can run that rail. Carried beside the rail on every
  /// response, so a name is never mistaken for a working route.
  final RailAvailability availability;

  final TransactionStatus status;
  final DateTime createdAt;
  final int version;

  @override
  String toString() => 'Transaction($transactionId)';
}
