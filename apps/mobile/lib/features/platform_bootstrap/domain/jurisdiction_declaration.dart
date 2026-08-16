// PURE DART ONLY. See lib/README.md — domain purity.
//
// SELF-DECLARED JURISDICTION.
//
// A declaration records where the subject says they are. It is always
// USER_DECLARED and always UNVERIFIED, and it widens nothing: no capability,
// no permission and no processing basis follows from it. The response states
// the verification state as a field precisely so a client cannot read a
// successful declaration as verification, and this layer keeps that field
// rather than collapsing it into a boolean.
import 'package:meta/meta.dart';

import '../../../core/errors/result.dart';

/// Who asserted the jurisdiction.
enum JurisdictionDeclarationSource {
  /// The subject declared it themselves.
  userDeclared,

  /// A source this build does not recognise. Rendered as unrecognised rather
  /// than as a self-declaration.
  unrecognised,
}

/// The verification state of a declaration.
enum JurisdictionDeclarationVerification {
  /// Recorded, unverified. The only state this route can produce.
  unverified,

  /// A state this build does not recognise. Never read as verified.
  unrecognised,
}

/// A jurisdiction reference the platform offers for selection.
///
/// The client never composes one. An identifier the platform register does not
/// hold is refused server-side rather than stored as free text, so a locally
/// typed value would be a request that cannot succeed.
@immutable
final class JurisdictionReference {
  const JurisdictionReference({required this.id});

  final String id;

  @override
  bool operator ==(Object other) => other is JurisdictionReference && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() => 'JurisdictionReference($id)';
}

/// The outcome of a self-declaration.
@immutable
final class JurisdictionDeclaration {
  const JurisdictionDeclaration({
    required this.jurisdictionId,
    required this.recorded,
    required this.source,
    required this.verification,
    required this.effectiveFrom,
  });

  /// The declared jurisdiction as data, for display and pack selection. Never
  /// branched on.
  final String jurisdictionId;

  /// False when the caller re-declared the jurisdiction already in effect: the
  /// standing assignment is returned and no new history window opens. A retry
  /// therefore does not churn the assignment history, and the client says so
  /// rather than reporting a change that did not happen.
  final bool recorded;

  final JurisdictionDeclarationSource source;

  final JurisdictionDeclarationVerification verification;

  final DateTime effectiveFrom;

  /// Always false. Present as a method rather than an absent concept so a
  /// reader of this type cannot mistake a recorded declaration for a verified
  /// one.
  bool get isVerified => false;

  @override
  String toString() => 'JurisdictionDeclaration(recorded: $recorded)';
}

/// The port for declaring the caller's own jurisdiction.
abstract interface class JurisdictionRepository {
  Future<Result<JurisdictionDeclaration>> declareOwn(JurisdictionReference reference);
}

/// Records the subject's own jurisdiction.
final class DeclareOwnJurisdiction {
  const DeclareOwnJurisdiction(this._repository);

  final JurisdictionRepository _repository;

  Future<Result<JurisdictionDeclaration>> call(JurisdictionReference reference) =>
      _repository.declareOwn(reference);
}
