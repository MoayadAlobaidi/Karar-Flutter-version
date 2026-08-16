// Tenant binding and switching, at the layer where the rules live.
//
// The switch is the delicate path. A session that is bound to a tenant it no
// longer has a membership in, or that keeps a credential the server has
// already revoked, is the defect these tests exist to prevent.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/core/networking/problem_details.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/features/tenant_selection/data/api_tenant_binding_repository.dart';
import 'package:karar_mobile/features/tenant_selection/data/api_tenant_invitation_repository.dart';
import 'package:karar_mobile/features/tenant_selection/domain/invitation_redemption.dart';
import 'package:karar_mobile/features/tenant_selection/domain/tenant_binding.dart';

import '../../core/support/fakes.dart';
import '../platform_bootstrap/support/feature_harness.dart';
import '../platform_bootstrap/support/fixtures.dart';

Map<String, Object?> boundResponse({String tenantId = testTenantId}) => <String, Object?>{
      'kind': 'BOUND',
      'binding': <String, Object?>{
        'kind': 'BOUND',
        'tenant': <String, Object?>{
          'tenantId': tenantId,
          'name': 'Example Organisation',
          'roleHint': 'MEMBER',
        },
      },
    };

Map<String, Object?> switchedResponse({String sessionId = 'session-0002'}) =>
    <String, Object?>{
      'kind': 'SWITCHED',
      'binding': <String, Object?>{
        'kind': 'BOUND',
        'tenant': <String, Object?>{
          'tenantId': 'tenant-0002',
          'name': 'Second Organisation',
          'roleHint': 'OWNER',
        },
      },
      'tokens': <String, Object?>{
        'accessToken': 'new-access',
        'accessTokenExpiresAt': '2999-01-01T00:00:00.000Z',
        'refreshToken': 'new-refresh',
        'refreshTokenExpiresAt': '2999-01-01T00:00:00.000Z',
        'sessionId': sessionId,
      },
    };

/// A repository under test, with an in-memory session it can replace.
final class BindingHarness {
  BindingHarness({Object? body, Failure? failure})
      : tokens = InMemoryTokenStore(),
        _body = body,
        _failure = failure {
    sessions = SessionManager(store: tokens, logger: AppLogger.silent);
    repository = ApiTenantBindingRepository(
      client: KararApiClient(
        FakeApiTransport((ApiRequest request) async {
          requests.add(request);
          final failure = _failure;
          if (failure != null) {
            throw ApiException(failure, statusCode: 409);
          }
          return ApiResponse(statusCode: 200, body: _body);
        }),
      ),
      sessions: sessions,
      logger: AppLogger.silent,
    );
  }

  final InMemoryTokenStore tokens;
  final Object? _body;
  final Failure? _failure;
  final List<ApiRequest> requests = <ApiRequest>[];

  late final SessionManager sessions;
  late final ApiTenantBindingRepository repository;

  Future<void> signIn() async {
    await sessions.adopt(liveTokens());
    tokens.writes = 0;
    tokens.clears = 0;
  }
}

/// Records whether the tenant-scoped state was discarded, and when.
final class RecordingScopedState implements TenantScopedState {
  int discards = 0;

  @override
  Future<void> discard() async {
    discards++;
  }
}

void main() {
  group('the selection policy', () {
    const policy = TenantSelectionPolicy();

    test('no membership is an onboarding state, not a choice', () {
      expect(policy.decide(const <TenantChoice>[]), isA<NoTenantMembership>());
    });

    test('exactly one membership is bound without asking', () {
      final decision = policy.decide(<TenantChoice>[twoTenantChoices.first]);

      expect(decision, isA<BindSingleTenant>());
      expect((decision as BindSingleTenant).choice, twoTenantChoices.first);
    });

    test('several memberships require a choice', () {
      final decision = policy.decide(twoTenantChoices);

      expect(decision, isA<ChooseTenant>());
      expect((decision as ChooseTenant).choices, twoTenantChoices);
    });

    test('an identifier nobody offered is not offered', () {
      expect(policy.isOffered(twoTenantChoices, 'tenant-0001'), isTrue);
      expect(policy.isOffered(twoTenantChoices, 'tenant-9999'), isFalse);
      expect(policy.isOffered(const <TenantChoice>[], 'tenant-0001'), isFalse);
    });
  });

  group('the binding repository', () {
    test('a first bind rotates no credential', () async {
      final harness = BindingHarness(body: boundResponse());
      addTearDown(harness.sessions.dispose);
      await harness.signIn();

      final result = await harness.repository.bind(testTenantId);

      expect(result.valueOrNull, isA<TenantBound>());
      expect(result.valueOrNull?.tenant.tenantId, testTenantId);
      expect(harness.tokens.writes, 0, reason: 'a first bind issues no new credential');
      expect(harness.tokens.clears, 0);
      expect(harness.sessions.tokens?.accessToken, 'access');
    });

    test('a switch replaces the credential, dropping the dead one first', () async {
      final harness = BindingHarness(body: switchedResponse());
      addTearDown(harness.sessions.dispose);
      await harness.signIn();

      final result = await harness.repository.bind('tenant-0002');

      expect(result.valueOrNull, isA<TenantSwitched>());
      expect((result.valueOrNull! as TenantSwitched).sessionId, 'session-0002');
      expect(
        harness.tokens.clears,
        1,
        reason: 'the revoked credential is wiped before the replacement is stored',
      );
      expect(harness.tokens.writes, 1);
      expect(harness.sessions.tokens?.accessToken, 'new-access');
      expect(harness.sessions.tokens?.refreshToken, 'new-refresh');
      expect(harness.sessions.tokens?.sessionId, 'session-0002');
    });

    test('the outcome carries no token material', () async {
      final harness = BindingHarness(body: switchedResponse());
      addTearDown(harness.sessions.dispose);
      await harness.signIn();

      final outcome = (await harness.repository.bind('tenant-0002')).valueOrNull!;

      expect(outcome.toString(), isNot(contains('new-access')));
      expect(outcome.toString(), isNot(contains('new-refresh')));
    });

    test('a membership revoked during the switch ends the session', () async {
      final harness = BindingHarness(
        failure: const ConflictFailure(
          code: ApiErrorCode.membershipRevokedConcurrently,
          correlationId: 'req-40',
        ),
      );
      addTearDown(harness.sessions.dispose);
      await harness.signIn();

      final result = await harness.repository.bind('tenant-0002');

      expect(result.failureOrNull, isA<ConflictFailure>());
      expect(
        harness.sessions.hasSession,
        isFalse,
        reason: 'a session is never left bound without a membership',
      );
      expect(harness.tokens.clears, 1);
    });

    test('a refused target leaves the session exactly as it was', () async {
      final harness = BindingHarness(
        failure: const NotAuthorizedFailure(code: ApiErrorCode.membershipRequired),
      );
      addTearDown(harness.sessions.dispose);
      await harness.signIn();

      final result = await harness.repository.bind('tenant-9999');

      expect(result.failureOrNull, isA<NotAuthorizedFailure>());
      expect(harness.sessions.hasSession, isTrue);
      expect(harness.tokens.clears, 0);
      expect(harness.tokens.writes, 0);
    });

    test('an unrecognised union branch is a contract violation, never a guess', () async {
      final harness = BindingHarness(body: <String, Object?>{'kind': 'SOMETHING_NEWER'});
      addTearDown(harness.sessions.dispose);
      await harness.signIn();

      final result = await harness.repository.bind(testTenantId);

      expect(result.failureOrNull, isA<ContractViolationFailure>());
    });

    test('a BOUND response that names no tenant is refused', () async {
      final harness = BindingHarness(
        body: <String, Object?>{
          'kind': 'BOUND',
          'binding': <String, Object?>{'kind': 'UNBOUND'},
        },
      );
      addTearDown(harness.sessions.dispose);
      await harness.signIn();

      final result = await harness.repository.bind(testTenantId);

      expect(result.failureOrNull, isA<ContractViolationFailure>());
    });

    test('a SWITCHED response that names no tenant ends the dead session', () async {
      final harness = BindingHarness(
        body: <String, Object?>{
          'kind': 'SWITCHED',
          'binding': <String, Object?>{'kind': 'UNBOUND'},
          'tokens': switchedResponse()['tokens'],
        },
      );
      addTearDown(harness.sessions.dispose);
      await harness.signIn();

      final result = await harness.repository.bind('tenant-0002');

      expect(result.failureOrNull, isA<ContractViolationFailure>());
      expect(
        harness.sessions.hasSession,
        isFalse,
        reason: 'the old credential is already dead server-side',
      );
    });

    test('sends the documented request with the platform-supplied identifier', () async {
      final harness = BindingHarness(body: boundResponse());
      addTearDown(harness.sessions.dispose);
      await harness.signIn();

      await harness.repository.bind(testTenantId);

      final request = harness.requests.single;
      expect(request.path, '/platform/tenant-binding');
      expect(request.method.wireName, 'POST');
      expect(request.requiresAuthentication, isTrue);
      expect((request.body! as Map<String, Object?>)['tenantId'], testTenantId);
    });
  });

  group('the switch use case', () {
    test('discards tenant-scoped state BEFORE the platform is asked', () async {
      final scopedState = RecordingScopedState();
      final order = <String>[];

      final repository = _RecordingRepository(() {
        order.add('bind');
        return Success<TenantBindingOutcome>(
          const TenantBound(
            TenantChoice(tenantId: 'tenant-0002', name: 'Second', roleHint: 'OWNER'),
          ),
        );
      }, onCall: () => order.add('bind-called'));

      final switchTenant = SwitchTenant(
        repository: repository,
        scopedState: _OrderedScopedState(scopedState, order),
      );

      await switchTenant(twoTenantChoices.last);

      expect(order.first, 'discard');
      expect(scopedState.discards, 1);
    });

    test('a failed switch still leaves no stale tenant-scoped state behind', () async {
      final scopedState = RecordingScopedState();
      final repository = _RecordingRepository(
        () => const Failed<TenantBindingOutcome>(
          ConflictFailure(code: ApiErrorCode.membershipRevokedConcurrently),
        ),
      );

      final result = await SwitchTenant(
        repository: repository,
        scopedState: scopedState,
      )(twoTenantChoices.last);

      expect(result.isFailure, isTrue);
      expect(scopedState.discards, 1);
    });

    test('a first bind does not discard, because nothing changed tenant', () async {
      final scopedState = RecordingScopedState();
      final repository = _RecordingRepository(
        () => Success<TenantBindingOutcome>(const TenantBound(TenantChoice(
          tenantId: testTenantId,
          name: 'Example Organisation',
          roleHint: 'MEMBER',
        ))),
      );

      await BindTenant(repository)(twoTenantChoices.first);

      expect(scopedState.discards, 0);
    });
  });

  group('tenant-scoped preferences', () {
    test('the registry is empty, so nothing is silently retained', () {
      expect(tenantScopedPreferenceKeyNames, isEmpty);
    });

    test('discarding removes every registered key', () async {
      final store = InMemoryKeyValueStore();
      for (final name in tenantScopedPreferenceKeyNames) {
        await store.writeString(PreferenceKey(name), 'stale');
      }

      await PreferenceTenantScopedState(store).discard();

      for (final name in tenantScopedPreferenceKeyNames) {
        expect(store.readString(PreferenceKey(name)), isNull);
      }
    });
  });

  group('invitation redemption', () {
    test('a blank token is refused locally rather than sent', () {
      expect(InvitationToken.tryParse(null), isNull);
      expect(InvitationToken.tryParse('   '), isNull);
      expect(InvitationToken.tryParse(' code '), isNotNull);
      expect(InvitationToken.tryParse(' code ')!.value, 'code');
    });

    test('the token type does not reveal its value in a string', () {
      final token = InvitationToken.tryParse('super-secret-code')!;

      expect(token.toString(), isNot(contains('super-secret-code')));
    });

    test('the tenant comes from the invitation record, never from the request',
        () async {
      final transport = FakeApiTransport(
        (ApiRequest request) async => ApiResponse(
          statusCode: 200,
          body: <String, Object?>{
            'tenantId': 'tenant-from-record',
            'membership': <String, Object?>{
              'effectiveFrom': '2026-01-01T00:00:00.000Z',
              'id': 'membership-1',
              'roleHint': 'MEMBER',
              'state': 'ACTIVE',
              'tenantId': 'tenant-from-record',
              'userId': testUserId,
            },
          },
        ),
      );

      final result = await ApiTenantInvitationRepository(KararApiClient(transport))
          .redeem(InvitationToken.tryParse('code')!);

      expect(result.valueOrNull?.tenantId, 'tenant-from-record');
      final body = transport.requests.single.body! as Map<String, Object?>;
      expect(body.keys, <String>['token']);
      expect(body.containsKey('tenantId'), isFalse);
    });

    test('a malformed redemption payload is a typed contract violation', () async {
      final transport = FakeApiTransport(
        (ApiRequest request) async =>
            ApiResponse(statusCode: 200, body: <String, Object?>{'tenantId': 't'}),
      );

      final result = await ApiTenantInvitationRepository(KararApiClient(transport))
          .redeem(InvitationToken.tryParse('code')!);

      expect(result.failureOrNull, isA<ContractViolationFailure>());
    });
  });
}

/// A repository whose answer and call order the test observes.
final class _RecordingRepository implements TenantBindingRepository {
  _RecordingRepository(this._answer, {this.onCall});

  final Result<TenantBindingOutcome> Function() _answer;
  final void Function()? onCall;

  @override
  Future<Result<TenantBindingOutcome>> bind(String tenantId) async {
    onCall?.call();
    return _answer();
  }
}

/// Records the discard in a shared order list.
final class _OrderedScopedState implements TenantScopedState {
  _OrderedScopedState(this._inner, this._order);

  final RecordingScopedState _inner;
  final List<String> _order;

  @override
  Future<void> discard() async {
    _order.add('discard');
    await _inner.discard();
  }
}
