// DTO → DOMAIN, AND NOTHING ELSE.
//
// There is exactly ONE reading of the contract in this client: the generated
// client and the generated DTOs, produced from `openapi.yaml` by
// `tool/generate_api_client.dart`. This file does not read the wire. It takes
// the already-decoded DTOs and turns them into the pure-Dart domain types the
// rest of the feature deals in.
//
// The pipeline the financial features follow is:
//
//     OpenAPI → generated client + DTOs → this mapper → domain → application
//
// WHY A MAPPER AT ALL, RATHER THAN PASSING THE DTOs UP
// ----------------------------------------------------
// A generated DTO is a shape the contract happens to have today. Three of the
// domain's guarantees are not expressible in one, and each is enforced here:
//
//   * an UNKNOWN vocabulary member is not a value. Every generated enum
//     carries an `unknown` member so a server that adds a value does not break
//     a client that has not shipped for it. That member maps to the domain's
//     `unrecognised` and never to a real member — a build that guessed would
//     present a value it does not understand as one it does;
//   * a CALENDAR DAY is not an instant. `format: date` arrives as a string and
//     becomes [CalendarDay], never a `DateTime`, so no zone offset is ever
//     applied to a day an institution wrote on its books;
//   * MONEY is characters. `minorUnits` stays a string end to end and is
//     checked against the contract's own pattern here; nothing parses it to a
//     number, so no rounding can enter at the boundary.
//
// Nothing here logs, and no failure carries a value: a contract violation
// names the LOCATION that drifted and nothing else.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/models.dart';
import '../domain/calendar_day.dart';
import '../domain/money.dart';
import '../domain/page.dart';

/// Runs [operation] and turns every boundary failure into a typed one.
///
/// Four exception shapes are caught. `ApiException` is what the transport and
/// the generated client raise for a non-2xx response. The other three are what
/// a generated decoder raises when the response does not match the contract.
///
/// `ContractFormatException` is the precise one: the generated decoder names
/// the FIELD that drifted, and that name is carried into the failure so an
/// incident says `FinancialAccountView.currency` rather than only "the read
/// failed". The bare `FormatException` and `TypeError` arms remain for a drift
/// raised outside a named field decode, and report the operation instead.
Future<Result<T>> guarded<T>(
  String location,
  Future<T> Function() operation,
) async {
  try {
    return Success<T>(await operation());
  } on ApiException catch (exception) {
    return Failed<T>(exception.failure);
  } on ContractFormatException catch (drift) {
    return Failed<T>(ContractViolationFailure(location: drift.path));
  } on FormatException {
    return Failed<T>(ContractViolationFailure(location: location));
  } on TypeError {
    return Failed<T>(ContractViolationFailure(location: location));
  }
}

/// The contract's own `MinorUnitString` pattern, `^-?[0-9]{1,30}$`.
///
/// The generated DTO types the field as a `String`, which is right — the value
/// must never become a number — but a string is not yet a ledger amount. The
/// pattern is checked here so a malformed figure is a typed failure rather
/// than something that renders as an amount.
final RegExp _exactMinorUnitsPattern = RegExp(r'^-?[0-9]{1,30}$');

/// One exact monetary amount.
Money moneyFrom(MinorUnitAmountDto dto, String location) {
  if (!_exactMinorUnitsPattern.hasMatch(dto.minorUnits)) {
    throw contractViolation('$location.minorUnits');
  }
  return Money(
    minorUnits: dto.minorUnits,
    currency: dto.currency,
    exponent: dto.exponent,
  );
}

/// One amount, or nothing. Absent and explicitly null are the same answer to a
/// reader, and the contract sends `null` rather than omitting.
Money? moneyFromOrNull(MinorUnitAmountDto? dto, String location) =>
    dto == null ? null : moneyFrom(dto, location);

/// One `format: date` calendar day.
///
/// The generated DTO types it as a `String`, which is what keeps it a day: a
/// `DateTime` here would attach midnight in some zone to a value that has
/// neither a time nor a zone.
CalendarDay calendarDayFrom(String iso, String location) {
  final parsed = CalendarDay.tryParse(iso);
  if (parsed == null) {
    throw contractViolation(location);
  }
  return parsed;
}

CalendarDay? calendarDayFromOrNull(String? iso, String location) =>
    iso == null ? null : calendarDayFrom(iso, location);

/// The pagination envelope, as the platform stated it.
PageCursor cursorFrom(PageInfoDto dto) => PageCursor(
      limit: dto.limit,
      returned: dto.returned,
      hasMore: dto.hasMore,
      nextCursor: dto.nextCursor,
    );

/// One page of DTOs, mapped item by item.
Page<T> pageFrom<T, D>(
  List<D> items,
  PageInfoDto page,
  T Function(D item) map,
) =>
    Page<T>(
      items: List<T>.unmodifiable(<T>[for (final item in items) map(item)]),
      cursor: cursorFrom(page),
    );

/// A typed contract violation naming where the drift was.
ApiException contractViolation(String location) =>
    ApiException(ContractViolationFailure(location: location));

/// A refusal to WRITE a vocabulary member that has no wire form.
///
/// Every domain vocabulary carries an `unrecognised` member so a value the
/// platform sent that this build does not know can be named rather than
/// guessed at. Nothing may send one back: the client does not know what it
/// means, and picking a nearby member would write a record that is wrong in a
/// way nobody can see. It is a client defect rather than a platform one, so it
/// surfaces as an invalid request naming the field and never leaves the
/// device.
ApiException unwritableVocabularyMember(String field) => ApiException(
      InvalidRequestFailure(
        code: 'UNRECOGNISED_VOCABULARY_MEMBER',
        fields: <String>[field],
      ),
    );
