// DATA LAYER.
//
// The identity endpoints are documented in PROSE rather than with schemas
// (ADR-0009, `packages/api-contracts/openapi/paths/identity.yaml`), so the
// generated client returns the decoded object and the mapping lives here.
// This reader is the one place a field name is spelled.
//
// It throws `FormatException` for anything the contract does not describe.
// Repository implementations catch that alongside `ApiException` and `TypeError`
// and return a `ContractViolationFailure`, so a server that adds a field of a
// new shape degrades the client rather than crashing it.
//
// A thrown message names the FIELD and never the value: these payloads carry
// tokens, codes and addresses, and an exception message routinely reaches a
// log.
import '../../../core/networking/api_transport.dart';

/// Typed reads over one identity response body.
final class IdentityPayload {
  const IdentityPayload(this.json, {required this.location});

  final JsonMap json;

  /// A non-sensitive path expression used to locate a contract violation.
  final String location;

  /// A nested object.
  IdentityPayload object(String key) {
    final Object? value = json[key];
    if (value is JsonMap) {
      return IdentityPayload(value, location: '$location.$key');
    }
    throw FormatException('$location.$key is not an object');
  }

  /// A required, non-empty string.
  String string(String key) {
    final Object? value = json[key];
    if (value is String && value.isNotEmpty) {
      return value;
    }
    throw FormatException('$location.$key is not a non-empty string');
  }

  /// An optional string. Absent and null are the same answer; a value of the
  /// wrong type is a violation, not an absence.
  String? optionalString(String key) {
    final Object? value = json[key];
    if (value == null) {
      return null;
    }
    if (value is String) {
      return value.isEmpty ? null : value;
    }
    throw FormatException('$location.$key is not a string');
  }

  /// A required ISO-8601 instant, normalised to UTC.
  DateTime instant(String key) {
    final DateTime? parsed = DateTime.tryParse(string(key));
    if (parsed == null) {
      throw FormatException('$location.$key is not an instant');
    }
    return parsed.toUtc();
  }

  /// An optional ISO-8601 instant.
  DateTime? optionalInstant(String key) {
    final String? raw = optionalString(key);
    if (raw == null) {
      return null;
    }
    final DateTime? parsed = DateTime.tryParse(raw);
    if (parsed == null) {
      throw FormatException('$location.$key is not an instant');
    }
    return parsed.toUtc();
  }

  /// A boolean. [fallback] applies only when the field is absent or null,
  /// never when it holds a value of another type.
  bool boolean(String key, {required bool fallback}) {
    final Object? value = json[key];
    if (value == null) {
      return fallback;
    }
    if (value is bool) {
      return value;
    }
    throw FormatException('$location.$key is not a boolean');
  }

  /// A whole number.
  int integer(String key, {int? fallback}) {
    final Object? value = json[key];
    if (value == null && fallback != null) {
      return fallback;
    }
    if (value is int) {
      return value;
    }
    throw FormatException('$location.$key is not an integer');
  }

  /// A list of objects. An absent list is empty; a present non-list is a
  /// violation.
  List<IdentityPayload> objectList(String key) {
    final Object? value = json[key];
    if (value == null) {
      return const <IdentityPayload>[];
    }
    if (value is! List<Object?>) {
      throw FormatException('$location.$key is not a list');
    }
    final List<IdentityPayload> items = <IdentityPayload>[];
    for (int index = 0; index < value.length; index++) {
      final Object? item = value[index];
      if (item is! JsonMap) {
        throw FormatException('$location.$key[$index] is not an object');
      }
      items.add(IdentityPayload(item, location: '$location.$key[]'));
    }
    return items;
  }

  /// A list of non-empty strings.
  List<String> stringList(String key) {
    final Object? value = json[key];
    if (value is! List<Object?>) {
      throw FormatException('$location.$key is not a list');
    }
    final List<String> items = <String>[];
    for (int index = 0; index < value.length; index++) {
      final Object? item = value[index];
      if (item is! String || item.isEmpty) {
        throw FormatException('$location.$key[$index] is not a non-empty string');
      }
      items.add(item);
    }
    return items;
  }

  /// The value of the `status` discriminator, when the payload carries one.
  String? get status => optionalString('status');

  /// Never prints the payload: these bodies carry credentials.
  @override
  String toString() => 'IdentityPayload($location)';
}
