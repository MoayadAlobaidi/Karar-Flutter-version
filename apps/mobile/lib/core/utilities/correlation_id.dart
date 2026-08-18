// PURE DART ONLY.
//
// Correlation identifiers are opaque, carry no user or device information, and
// are safe to log and to display in a support screen. They are generated
// per-request on the client and propagated to the server so that a client
// report and a server trace can be joined without either side logging anything
// sensitive.
import 'dart:math';

import 'package:meta/meta.dart';

/// Produces request correlation identifiers.
abstract interface class CorrelationIdGenerator {
  /// A fresh identifier. Must not encode anything about the user, the device,
  /// or the request contents.
  String next();
}

/// The production generator: a random version-4 UUID from the platform CSPRNG.
///
/// A cryptographic source is used not because the value is a secret but
/// because a predictable identifier would let an observer correlate requests
/// across sessions.
@immutable
final class RandomCorrelationIdGenerator implements CorrelationIdGenerator {
  RandomCorrelationIdGenerator({Random? random}) : _random = random ?? Random.secure();

  final Random _random;

  static const String _hex = '0123456789abcdef';

  @override
  String next() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256), growable: false);
    // Version 4, RFC 4122 variant.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    final buffer = StringBuffer();
    for (var i = 0; i < bytes.length; i++) {
      if (i == 4 || i == 6 || i == 8 || i == 10) {
        buffer.write('-');
      }
      final byte = bytes[i];
      buffer
        ..write(_hex[(byte >> 4) & 0x0f])
        ..write(_hex[byte & 0x0f]);
    }
    return buffer.toString();
  }
}

/// A generator that returns a scripted sequence, for tests that assert on
/// propagation. Repeats the last value once the sequence is exhausted.
final class ScriptedCorrelationIdGenerator implements CorrelationIdGenerator {
  ScriptedCorrelationIdGenerator(this._values) {
    if (_values.isEmpty) {
      throw ArgumentError.value(_values, 'values', 'At least one identifier is required.');
    }
  }

  final List<String> _values;
  int _index = 0;

  @override
  String next() {
    final value = _values[_index];
    if (_index < _values.length - 1) {
      _index++;
    }
    return value;
  }
}
