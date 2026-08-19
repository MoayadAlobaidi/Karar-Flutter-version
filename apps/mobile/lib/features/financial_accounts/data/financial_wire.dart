// THE FINANCIAL CONTRACT, DECODED.
//
// WHY THIS FILE EXISTS RATHER THAN A CALL TO THE GENERATED CLIENT
// ---------------------------------------------------------------
// The generated client is written against `ApiTransport` and is the right
// thing to call wherever its DTOs can carry the contract. On the financial
// surface they cannot, and the failure is not subtle:
//
// The contract declares its vocabularies as NAMED components —
// `AccountType: { type: string, enum: [...] }` — and refers to them by `$ref`.
// The generator emits a DTO CLASS for every named component, so `AccountType`
// becomes `AccountTypeDto`, a class with no fields whose decoder reads
//
//     factory AccountTypeDto.fromJson(Map<String, Object?> json) =>
//         const AccountTypeDto();
//
// and whose call site reads
//
//     accountType: AccountTypeDto.fromJson(json['accountType']! as Map<...>)
//
// The wire value is the string `"CURRENT"`. Casting it to a Map throws, so
// `FinancialAccountViewDto.fromJson` cannot decode a well-formed response at
// all — and if it could, the value would be discarded, because the class has
// nowhere to put it. Roughly twenty vocabularies on this surface are affected:
// account type, status, origin, nature, wallet kind, issuer kind, balance
// kind, source kind, rail availability, money direction, transaction status,
// instrument type and status, and the rest. A test beside this file proves the
// throw rather than asserting it in prose.
//
// The generator, the contract and the generated client are all outside this
// workstream's ownership and none of them may be edited here. So the data
// layer decodes the contract itself, through the SAME transport port the
// generated client uses — the interceptor stack, the credential, the retry
// policy, the correlation id and the timeout profile are all unchanged. What
// is written by hand is the JSON mapping, which is the part the generator got
// wrong.
//
// Every decoder below fails LOUDLY and typed: a shape the contract does not
// permit becomes a `ContractViolationFailure` naming its location, never a
// null that renders as an empty row.
import '../../../core/errors/failure.dart';
import '../../../core/networking/api_transport.dart';
import '../domain/calendar_day.dart';
import '../domain/money.dart';
import '../domain/page.dart';

/// Reads one field of a decoded JSON object, with the location it came from so
/// a contract drift says which field drifted.
extension FinancialJson on JsonMap {
  /// A required object.
  JsonMap object(String key, String location) {
    final value = this[key];
    if (value is JsonMap) {
      return value;
    }
    throw _violation('$location.$key');
  }

  /// An optional object. Absent and explicitly null are the same answer; the
  /// contract sends `null` rather than omitting, and both are accepted.
  JsonMap? objectOrNull(String key, String location) {
    final value = this[key];
    if (value == null) {
      return null;
    }
    if (value is JsonMap) {
      return value;
    }
    throw _violation('$location.$key');
  }

  List<JsonMap> objectList(String key, String location) {
    final value = this[key];
    if (value is! List<Object?>) {
      throw _violation('$location.$key');
    }
    return <JsonMap>[
      for (final element in value)
        if (element is JsonMap) element else throw _violation('$location.$key[]'),
    ];
  }

  String string(String key, String location) {
    final value = this[key];
    if (value is String) {
      return value;
    }
    throw _violation('$location.$key');
  }

  String? stringOrNull(String key, String location) {
    final value = this[key];
    if (value == null) {
      return null;
    }
    if (value is String) {
      return value;
    }
    throw _violation('$location.$key');
  }

  int integer(String key, String location) {
    final value = this[key];
    if (value is int) {
      return value;
    }
    throw _violation('$location.$key');
  }

  bool boolean(String key, String location) {
    final value = this[key];
    if (value is bool) {
      return value;
    }
    throw _violation('$location.$key');
  }

  /// A `format: date-time` instant, normalised to UTC.
  DateTime instant(String key, String location) {
    final parsed = DateTime.tryParse(string(key, location));
    if (parsed == null) {
      throw _violation('$location.$key');
    }
    return parsed.toUtc();
  }

  DateTime? instantOrNull(String key, String location) {
    final raw = stringOrNull(key, location);
    if (raw == null) {
      return null;
    }
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) {
      throw _violation('$location.$key');
    }
    return parsed.toUtc();
  }

  /// A `format: date` calendar day. Never turned into a `DateTime`: see
  /// `domain/calendar_day.dart`.
  CalendarDay calendarDay(String key, String location) {
    final parsed = CalendarDay.tryParse(string(key, location));
    if (parsed == null) {
      throw _violation('$location.$key');
    }
    return parsed;
  }

  CalendarDay? calendarDayOrNull(String key, String location) {
    final raw = stringOrNull(key, location);
    if (raw == null) {
      return null;
    }
    final parsed = CalendarDay.tryParse(raw);
    if (parsed == null) {
      throw _violation('$location.$key');
    }
    return parsed;
  }

  /// A `MinorUnitAmount`: exact characters, a currency and its exponent.
  ///
  /// `minorUnits` stays a string the whole way through. It is never parsed to
  /// a number here, so no rounding can be introduced at the boundary.
  Money money(String key, String location) {
    final held = object(key, location);
    final at = '$location.$key';
    final minorUnits = held.string('minorUnits', at);
    if (!_exactIntegerPattern.hasMatch(minorUnits)) {
      throw _violation('$at.minorUnits');
    }
    return Money(
      minorUnits: minorUnits,
      currency: held.string('currency', at),
      exponent: held.integer('exponent', at),
    );
  }

  Money? moneyOrNull(String key, String location) {
    if (this[key] == null) {
      return null;
    }
    return money(key, location);
  }

  /// The pagination envelope.
  PageCursor pageCursor(String key, String location) {
    final held = object(key, location);
    final at = '$location.$key';
    return PageCursor(
      limit: held.integer('limit', at),
      returned: held.integer('returned', at),
      hasMore: held.boolean('hasMore', at),
      nextCursor: held.stringOrNull('nextCursor', at),
    );
  }
}

/// Decodes a `{ items, page }` envelope into a typed page.
Page<T> decodePage<T>(
  JsonMap body,
  String location,
  T Function(JsonMap item) decodeItem,
) =>
    Page<T>(
      items: List<T>.unmodifiable(<T>[
        for (final item in body.objectList('items', location)) decodeItem(item),
      ]),
      cursor: body.pageCursor('page', location),
    );

/// Maps a wire enumeration onto a domain one.
///
/// The fallback is always the vocabulary's `unrecognised` member and never a
/// convenient default: the server may add a value at any time, and a client
/// that guessed would present a value it does not understand as one it does.
T decodeEnum<T>(String? wire, Map<String, T> vocabulary, T unrecognised) =>
    wire == null ? unrecognised : (vocabulary[wire] ?? unrecognised);

/// The contract's own `^-?[0-9]{1,30}$`.
final RegExp _exactIntegerPattern = RegExp(r'^-?[0-9]{1,30}$');

ApiException _violation(String location) =>
    ApiException(ContractViolationFailure(location: location));
