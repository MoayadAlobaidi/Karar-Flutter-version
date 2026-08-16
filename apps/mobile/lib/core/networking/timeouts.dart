// PURE DART ONLY.
//
// Every request carries an explicit timeout profile. There is no "no timeout"
// option: a request that hangs forever holds a refresh barrier open and turns
// a transient outage into a frozen application.
import 'package:meta/meta.dart';

/// Typed timeouts for one request.
@immutable
final class TimeoutProfile {
  const TimeoutProfile({
    required this.connect,
    required this.send,
    required this.receive,
  });

  /// Establishing the connection, including TLS.
  final Duration connect;

  /// Writing the request body.
  final Duration send;

  /// Waiting for and reading the response.
  final Duration receive;

  /// The default for ordinary calls.
  static const TimeoutProfile standard = TimeoutProfile(
    connect: Duration(seconds: 10),
    send: Duration(seconds: 15),
    receive: Duration(seconds: 20),
  );

  /// Tighter budget for calls that block a screen the user is looking at.
  static const TimeoutProfile interactive = TimeoutProfile(
    connect: Duration(seconds: 6),
    send: Duration(seconds: 8),
    receive: Duration(seconds: 10),
  );

  /// Startup calls: the session refresh and the bootstrap fetch. Short,
  /// because startup shows a blocking state until they resolve.
  static const TimeoutProfile startup = TimeoutProfile(
    connect: Duration(seconds: 6),
    send: Duration(seconds: 8),
    receive: Duration(seconds: 12),
  );

  /// The whole-request ceiling, used where only one number can be applied.
  Duration get total => connect + send + receive;

  @override
  bool operator ==(Object other) =>
      other is TimeoutProfile &&
      other.connect == connect &&
      other.send == send &&
      other.receive == receive;

  @override
  int get hashCode => Object.hash(connect, send, receive);

  @override
  String toString() =>
      'TimeoutProfile(connect: ${connect.inMilliseconds}ms, '
      'send: ${send.inMilliseconds}ms, receive: ${receive.inMilliseconds}ms)';
}
