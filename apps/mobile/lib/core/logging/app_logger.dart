// PURE DART ONLY (dart:developer is part of the Dart SDK, not Flutter).
//
// The single diagnostic surface. `print` is banned by the analyzer; every
// diagnostic goes through here so that redaction cannot be bypassed by
// accident.
//
// No analytics, crash-reporting, advertising, or fingerprinting sink exists or
// may be added here.
import 'dart:developer' as developer;

import 'package:meta/meta.dart';

import 'redaction.dart';

/// Severity, ordered.
enum LogLevel {
  trace(0),
  debug(1),
  info(2),
  warning(3),
  error(4);

  const LogLevel(this.severity);

  final int severity;

  bool operator >=(LogLevel other) => severity >= other.severity;
}

/// One diagnostic event. Immutable and already redacted by the time it
/// reaches a sink.
@immutable
final class LogRecord {
  const LogRecord({
    required this.level,
    required this.category,
    required this.message,
    required this.fields,
    this.correlationId,
    this.error,
    this.stackTrace,
  });

  final LogLevel level;

  /// Coarse origin, e.g. `networking`, `startup`, `security`.
  final String category;

  /// A fixed, developer-authored string. Never interpolated with user input,
  /// a server message, or a response body.
  final String message;

  /// Structured, already-redacted diagnostic fields.
  final Map<String, Object?> fields;

  final String? correlationId;

  /// The error's type name only — never the error's own message, which may
  /// embed a server response.
  final String? error;

  final StackTrace? stackTrace;

  @override
  String toString() {
    final buffer = StringBuffer()
      ..write('[${level.name}] ')
      ..write(category)
      ..write(': ')
      ..write(message);
    if (correlationId != null) {
      buffer.write(' correlationId=$correlationId');
    }
    if (error != null) {
      buffer.write(' error=$error');
    }
    if (fields.isNotEmpty) {
      buffer.write(' $fields');
    }
    return buffer.toString();
  }
}

/// Where records go.
abstract interface class LogSink {
  void write(LogRecord record);
}

/// Discards everything. The default for production builds: the client emits
/// no diagnostics off-device, and no third-party sink is wired in.
@immutable
final class NoopLogSink implements LogSink {
  const NoopLogSink();

  @override
  void write(LogRecord record) {}
}

/// Writes to the Dart VM developer log. Attached only in non-production
/// environments.
@immutable
final class DeveloperLogSink implements LogSink {
  const DeveloperLogSink();

  @override
  void write(LogRecord record) {
    developer.log(
      record.toString(),
      name: 'karar.${record.category}',
      level: record.level.severity * 250,
      stackTrace: record.stackTrace,
    );
  }
}

/// Keeps records in memory so that a test can assert on what was and — more
/// importantly — was not written.
final class RecordingLogSink implements LogSink {
  final List<LogRecord> records = <LogRecord>[];

  @override
  void write(LogRecord record) => records.add(record);

  void clear() => records.clear();
}

/// Applies the level threshold and the redaction policy, then hands the record
/// to the sink.
@immutable
final class AppLogger {
  const AppLogger({
    required LogSink sink,
    required LogLevel minimumLevel,
    Redactor redactor = const Redactor(),
  })  : _sink = sink,
        _minimumLevel = minimumLevel,
        _redactor = redactor;

  /// A logger that discards everything. Used as a safe default so that no
  /// call site has to null-check.
  static const AppLogger silent = AppLogger(
    sink: NoopLogSink(),
    minimumLevel: LogLevel.error,
  );

  final LogSink _sink;
  final LogLevel _minimumLevel;
  final Redactor _redactor;

  /// Returns a logger that tags every record with [category].
  CategoryLogger forCategory(String category) => CategoryLogger._(this, category);

  void log(
    LogLevel level,
    String category,
    String message, {
    Map<String, Object?> fields = const <String, Object?>{},
    String? correlationId,
    Object? error,
    StackTrace? stackTrace,
  }) {
    if (!(level >= _minimumLevel)) {
      return;
    }
    _sink.write(
      LogRecord(
        level: level,
        category: category,
        message: message,
        fields: _redactor.redactFields(fields),
        correlationId: correlationId,
        // Only the runtime type is recorded. An exception's message routinely
        // embeds the payload that produced it.
        error: error?.runtimeType.toString(),
        stackTrace: stackTrace,
      ),
    );
  }
}

/// A logger bound to one category, so call sites do not repeat it.
@immutable
final class CategoryLogger {
  const CategoryLogger._(this._logger, this._category);

  final AppLogger _logger;
  final String _category;

  void trace(String message, {Map<String, Object?> fields = const <String, Object?>{}, String? correlationId}) =>
      _logger.log(LogLevel.trace, _category, message, fields: fields, correlationId: correlationId);

  void debug(String message, {Map<String, Object?> fields = const <String, Object?>{}, String? correlationId}) =>
      _logger.log(LogLevel.debug, _category, message, fields: fields, correlationId: correlationId);

  void info(String message, {Map<String, Object?> fields = const <String, Object?>{}, String? correlationId}) =>
      _logger.log(LogLevel.info, _category, message, fields: fields, correlationId: correlationId);

  void warning(
    String message, {
    Map<String, Object?> fields = const <String, Object?>{},
    String? correlationId,
    Object? error,
  }) =>
      _logger.log(
        LogLevel.warning,
        _category,
        message,
        fields: fields,
        correlationId: correlationId,
        error: error,
      );

  void error(
    String message, {
    Map<String, Object?> fields = const <String, Object?>{},
    String? correlationId,
    Object? error,
    StackTrace? stackTrace,
  }) =>
      _logger.log(
        LogLevel.error,
        _category,
        message,
        fields: fields,
        correlationId: correlationId,
        error: error,
        stackTrace: stackTrace,
      );
}
