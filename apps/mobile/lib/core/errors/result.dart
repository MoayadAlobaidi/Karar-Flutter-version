// PURE DART ONLY — imported by feature domain layers. See failure.dart.
import 'package:meta/meta.dart';

import 'failure.dart';

/// The return type of every repository port and use case.
///
/// Expected outcomes are values, not exceptions. A caller cannot forget to
/// handle the failure branch because `Result` is sealed and the analyzer
/// requires the switch to be exhaustive.
@immutable
sealed class Result<T> {
  const Result();

  /// Wraps a successful value.
  const factory Result.success(T value) = Success<T>;

  /// Wraps a typed failure.
  const factory Result.failure(Failure failure) = Failed<T>;

  bool get isSuccess => this is Success<T>;

  bool get isFailure => this is Failed<T>;

  /// The value, or null when this is a failure. Prefer an exhaustive switch;
  /// this exists for the narrow cases where a null is genuinely the right
  /// fallback.
  T? get valueOrNull => switch (this) {
        Success<T>(:final value) => value,
        Failed<T>() => null,
      };

  /// The failure, or null when this is a success.
  Failure? get failureOrNull => switch (this) {
        Success<T>() => null,
        Failed<T>(:final failure) => failure,
      };

  /// Transforms the success value, preserving the failure branch untouched.
  Result<R> map<R>(R Function(T value) transform) => switch (this) {
        Success<T>(:final value) => Success<R>(transform(value)),
        Failed<T>(:final failure) => Failed<R>(failure),
      };

  /// Chains another fallible step.
  Result<R> flatMap<R>(Result<R> Function(T value) transform) => switch (this) {
        Success<T>(:final value) => transform(value),
        Failed<T>(:final failure) => Failed<R>(failure),
      };

  /// Collapses both branches into a single value.
  R fold<R>({
    required R Function(T value) onSuccess,
    required R Function(Failure failure) onFailure,
  }) =>
      switch (this) {
        Success<T>(:final value) => onSuccess(value),
        Failed<T>(:final failure) => onFailure(failure),
      };
}

/// The success branch.
final class Success<T> extends Result<T> {
  const Success(this.value);

  final T value;

  @override
  bool operator ==(Object other) => other is Success<T> && other.value == value;

  @override
  int get hashCode => Object.hash(Success<T>, value);

  @override
  String toString() => 'Success<$T>()';
}

/// The failure branch.
final class Failed<T> extends Result<T> {
  const Failed(this.failure);

  final Failure failure;

  @override
  bool operator ==(Object other) => other is Failed<T> && other.failure.runtimeType == failure.runtimeType;

  @override
  int get hashCode => Object.hash(Failed<T>, failure.runtimeType);

  @override
  String toString() => 'Failed<$T>(${failure.diagnosticLabel})';
}
