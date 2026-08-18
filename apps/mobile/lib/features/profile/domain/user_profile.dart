// PURE DART ONLY. See lib/README.md — domain purity.
//
// THE SUBJECT'S OWN PROFILE.
//
// Two fields are editable by the subject and the platform accepts no others:
// display name and locale. The rest is state the platform owns — account
// status, residency reference, tenant, timestamps — and this client renders it
// without implying it can be changed here.
//
// The disable request records an INTENT. Nothing acts on it yet: no session is
// revoked and no data is removed by it. The client says exactly that rather
// than presenting it as a completed deletion, which would be a promise the
// platform has not made.
import 'package:meta/meta.dart';

import '../../../core/errors/result.dart';

/// The platform's account status for the subject.
enum AccountStatus {
  active,

  /// The subject asked for the account to be disabled; the platform has
  /// recorded the intent and nothing more.
  disableRequested,

  /// The subject asked for deletion; recorded, not performed.
  deletionRequested,

  disabled,

  /// A status this build does not recognise. Rendered as unrecognised, never
  /// as active.
  unrecognised,
}

/// The subject's own profile.
@immutable
final class UserProfile {
  const UserProfile({
    required this.userId,
    required this.tenantId,
    required this.displayName,
    required this.locale,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.residencyJurisdictionRef,
  });

  final String userId;
  final String tenantId;
  final String displayName;

  /// A BCP-47-shaped tag as the platform stores it.
  final String locale;

  final AccountStatus status;

  /// A typed unresolved reference. Data for display; never branched on.
  final String? residencyJurisdictionRef;

  final DateTime createdAt;
  final DateTime updatedAt;

  @override
  String toString() => 'UserProfile($userId)';
}

/// The fields the subject may change.
///
/// A change set with nothing in it is refused by the platform
/// (`NO_APPROVED_FIELD_CHANGES`); [isEmpty] lets the client decline to send one
/// rather than provoke that.
@immutable
final class ProfileChangeSet {
  const ProfileChangeSet({this.displayName, this.locale});

  final String? displayName;
  final String? locale;

  bool get isEmpty => displayName == null && locale == null;

  @override
  String toString() => 'ProfileChangeSet()';
}

/// The recorded intent to disable the account.
@immutable
final class AccountDisableRequest {
  const AccountDisableRequest({required this.requestedAt, required this.auditRecorded});

  final DateTime requestedAt;

  /// False when the state change committed but the audit append did not. The
  /// client surfaces it rather than hiding a partially recorded decision.
  final bool auditRecorded;

  @override
  String toString() => 'AccountDisableRequest()';
}

/// The port for the subject's own profile.
abstract interface class ProfileRepository {
  Future<Result<UserProfile>> readOwn();

  Future<Result<UserProfile>> updateOwn(ProfileChangeSet changes);

  Future<Result<AccountDisableRequest>> requestDisable({String? reason});
}

/// Reads the subject's own profile.
final class LoadOwnProfile {
  const LoadOwnProfile(this._repository);

  final ProfileRepository _repository;

  Future<Result<UserProfile>> call() => _repository.readOwn();
}

/// Updates the approved subject-editable fields.
final class UpdateOwnProfile {
  const UpdateOwnProfile(this._repository);

  final ProfileRepository _repository;

  Future<Result<UserProfile>> call(ProfileChangeSet changes) =>
      _repository.updateOwn(changes);
}

/// Records the intent to disable the account.
final class RequestAccountDisable {
  const RequestAccountDisable(this._repository);

  final ProfileRepository _repository;

  Future<Result<AccountDisableRequest>> call({String? reason}) =>
      _repository.requestDisable(reason: reason);
}
