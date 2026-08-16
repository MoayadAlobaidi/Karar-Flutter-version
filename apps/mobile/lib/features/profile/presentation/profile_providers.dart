// Providers for the subject's own profile.
//
// The profile is tenant-scoped: it is read under the session's binding and is
// invalid the moment that binding changes. `ownProfileProvider` is therefore
// registered as a tenant-scoped provider at composition time so a switch
// discards it.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_profile_repository.dart';
import '../domain/user_profile.dart';

final Provider<ProfileRepository> profileRepositoryProvider = Provider<ProfileRepository>(
  (Ref ref) => ApiProfileRepository(ref.watch(apiClientProvider)),
);

final Provider<LoadOwnProfile> loadOwnProfileProvider = Provider<LoadOwnProfile>(
  (Ref ref) => LoadOwnProfile(ref.watch(profileRepositoryProvider)),
);

final Provider<UpdateOwnProfile> updateOwnProfileProvider = Provider<UpdateOwnProfile>(
  (Ref ref) => UpdateOwnProfile(ref.watch(profileRepositoryProvider)),
);

final Provider<RequestAccountDisable> requestAccountDisableProvider =
    Provider<RequestAccountDisable>(
  (Ref ref) => RequestAccountDisable(ref.watch(profileRepositoryProvider)),
);

/// The loaded profile, or the typed failure that prevented it.
sealed class ProfileView {
  const ProfileView();
}

final class ProfileLoaded extends ProfileView {
  const ProfileLoaded(this.profile);

  final UserProfile profile;
}

final class ProfileUnavailable extends ProfileView {
  const ProfileUnavailable(this.failure);

  final Failure failure;
}

/// Reads the subject's own profile.
final class OwnProfileController extends AsyncNotifier<ProfileView> {
  @override
  Future<ProfileView> build() async {
    final result = await ref.watch(loadOwnProfileProvider)();
    return switch (result) {
      Success<UserProfile>(:final value) => ProfileLoaded(value),
      Failed<UserProfile>(:final failure) => ProfileUnavailable(failure),
    };
  }

  Future<void> refresh() async {
    state = const AsyncLoading<ProfileView>();
    state = await AsyncValue.guard<ProfileView>(build);
  }
}

final AsyncNotifierProvider<OwnProfileController, ProfileView> ownProfileProvider =
    AsyncNotifierProvider<OwnProfileController, ProfileView>(OwnProfileController.new);

/// The state of one profile edit.
sealed class ProfileEditState {
  const ProfileEditState();
}

final class ProfileEditIdle extends ProfileEditState {
  const ProfileEditIdle();
}

final class ProfileEditSubmitting extends ProfileEditState {
  const ProfileEditSubmitting();
}

/// The platform accepted the change and returned the stored profile.
final class ProfileEditSaved extends ProfileEditState {
  const ProfileEditSaved(this.profile);

  final UserProfile profile;
}

final class ProfileEditRejected extends ProfileEditState {
  const ProfileEditRejected(this.failure);

  final Failure failure;

  /// The change set contained nothing the platform accepts.
  bool get noApprovedChanges => failure.code == 'NO_APPROVED_FIELD_CHANGES';
}

/// Sequences one profile edit.
final class ProfileEditController extends Notifier<ProfileEditState> {
  @override
  ProfileEditState build() => const ProfileEditIdle();

  Future<void> save(ProfileChangeSet changes) async {
    if (state is ProfileEditSubmitting) {
      return;
    }
    state = const ProfileEditSubmitting();
    final result = await ref.read(updateOwnProfileProvider)(changes);
    switch (result) {
      case Failed<UserProfile>(:final failure):
        state = ProfileEditRejected(failure);
      case Success<UserProfile>(:final value):
        state = ProfileEditSaved(value);
        await ref.read(ownProfileProvider.notifier).refresh();
    }
  }
}

final NotifierProvider<ProfileEditController, ProfileEditState>
    profileEditControllerProvider =
    NotifierProvider<ProfileEditController, ProfileEditState>(
  ProfileEditController.new,
);

/// The state of one account-disable request.
sealed class AccountDisableState {
  const AccountDisableState();
}

final class AccountDisableIdle extends AccountDisableState {
  const AccountDisableIdle();
}

final class AccountDisableSubmitting extends AccountDisableState {
  const AccountDisableSubmitting();
}

/// The platform recorded the intent. Nothing has been disabled by it.
final class AccountDisableRecorded extends AccountDisableState {
  const AccountDisableRecorded(this.request);

  final AccountDisableRequest request;
}

final class AccountDisableRejected extends AccountDisableState {
  const AccountDisableRejected(this.failure);

  final Failure failure;
}

/// Sequences one disable request.
final class AccountDisableController extends Notifier<AccountDisableState> {
  @override
  AccountDisableState build() => const AccountDisableIdle();

  Future<void> request() async {
    if (state is AccountDisableSubmitting) {
      return;
    }
    state = const AccountDisableSubmitting();
    // No reason is sent. A free-text reason would be personal data the client
    // has no instruction to collect.
    final result = await ref.read(requestAccountDisableProvider)();
    switch (result) {
      case Failed<AccountDisableRequest>(:final failure):
        state = AccountDisableRejected(failure);
      case Success<AccountDisableRequest>(:final value):
        state = AccountDisableRecorded(value);
        await ref.read(ownProfileProvider.notifier).refresh();
    }
  }
}

final NotifierProvider<AccountDisableController, AccountDisableState>
    accountDisableControllerProvider =
    NotifierProvider<AccountDisableController, AccountDisableState>(
  AccountDisableController.new,
);
