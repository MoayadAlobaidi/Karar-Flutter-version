// RFC 7807 decoding and typed failure mapping.
//
// Code-first, status as fallback. An unrecognised code is never treated as
// success and never swallowed.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/networking/problem_details.dart';
import 'package:karar_mobile/core/networking/problem_failure_mapper.dart';

Map<String, Object?> problemBody(
  String code, {
  int status = 400,
  String? reason,
  bool? retryable,
  String? requestId,
  String? detail,
}) =>
    <String, Object?>{
      'type': 'https://errors.example.invalid/$code',
      'title': 'A title the client must not branch on',
      'status': status,
      'code': code,
      'reason': ?reason,
      'retryable': ?retryable,
      'requestId': ?requestId,
      'detail': ?detail,
    };

void main() {
  const mapper = ProblemFailureMapper();

  Failure mapCode(String code, {int status = 400, String? reason, bool? retryable}) {
    final problem = ProblemDetails.tryParse(
      problemBody(code, status: status, reason: reason, retryable: retryable),
      statusCode: status,
    );
    expect(problem, isNotNull);
    return mapper.map(statusCode: status, problem: problem, correlationId: 'corr-1');
  }

  group('parsing', () {
    test('reads the machine-readable fields', () {
      final problem = ProblemDetails.tryParse(
        problemBody(
          ApiErrorCode.bootstrapUnavailable,
          status: 503,
          retryable: true,
          requestId: 'req-9',
        ),
        statusCode: 503,
      );

      expect(problem!.code, ApiErrorCode.bootstrapUnavailable);
      expect(problem.status, 503);
      expect(problem.retryable, isTrue);
      expect(problem.requestId, 'req-9');
    });

    test('returns null for a body that is not a problem document', () {
      expect(ProblemDetails.tryParse(<String, Object?>{'ok': true}, statusCode: 500), isNull);
      expect(ProblemDetails.tryParse('plain text', statusCode: 500), isNull);
      expect(ProblemDetails.tryParse(null, statusCode: 500), isNull);
    });

    test('never exposes server prose through toString', () {
      final problem = ProblemDetails.tryParse(
        problemBody(ApiErrorCode.notAuthorized, status: 403, detail: 'user@example.invalid'),
        statusCode: 403,
      );

      expect(problem.toString(), isNot(contains('user@example.invalid')));
      expect(problem.toString(), isNot(contains('A title the client')));
    });
  });

  group('code-first mapping', () {
    test('authentication and session codes', () {
      expect(
        mapCode(ApiErrorCode.authenticationRequired, status: 401),
        isA<AuthenticationRequiredFailure>(),
      );
      expect(
        mapCode(ApiErrorCode.sessionExpired, status: 401),
        isA<SessionExpiredFailure>(),
      );
    });

    test('authorization codes', () {
      final notAuthorized = mapCode(
        ApiErrorCode.notAuthorized,
        status: 403,
        reason: 'tenancy.member.read',
      );
      expect(notAuthorized, isA<NotAuthorizedFailure>());
      expect((notAuthorized as NotAuthorizedFailure).requirement, 'tenancy.member.read');

      expect(
        mapCode(ApiErrorCode.membershipRequired, status: 403),
        isA<NotAuthorizedFailure>(),
      );
      expect(
        mapCode(ApiErrorCode.operationRestricted, status: 403),
        isA<OperationRestrictedFailure>(),
      );
      expect(
        mapCode(ApiErrorCode.declarationNotPermitted, status: 409),
        isA<OperationRestrictedFailure>(),
      );
    });

    test('consent codes', () {
      expect(mapCode(ApiErrorCode.consentRequired, status: 409), isA<ConsentRequiredFailure>());
      expect(
        mapCode(ApiErrorCode.reConsentRequired, status: 409),
        isA<ReConsentRequiredFailure>(),
      );
    });

    test('tenant binding codes route to one destination', () {
      expect(
        mapCode(ApiErrorCode.tenantSelectionRequired, status: 409),
        isA<TenantSelectionRequiredFailure>(),
      );
      expect(
        mapCode(ApiErrorCode.tenantBindingRequired, status: 409),
        isA<TenantSelectionRequiredFailure>(),
      );
    });

    test('bootstrap unavailability carries the retryable flag', () {
      final retryable = mapCode(
        ApiErrorCode.bootstrapUnavailable,
        status: 503,
        retryable: true,
      );
      expect(retryable, isA<BootstrapUnavailableFailure>());
      expect((retryable as BootstrapUnavailableFailure).retryable, isTrue);

      final terminal = mapCode(
        ApiErrorCode.bootstrapUnavailable,
        status: 503,
        retryable: false,
      );
      expect((terminal as BootstrapUnavailableFailure).retryable, isFalse);

      final unstated = mapCode(ApiErrorCode.bootstrapUnavailable, status: 503);
      expect(
        (unstated as BootstrapUnavailableFailure).retryable,
        isNull,
        reason: 'absent rather than guessed',
      );
    });

    test('capability and dependency unavailability', () {
      expect(
        mapCode(ApiErrorCode.capabilityResolutionUnavailable, status: 503),
        isA<CapabilityResolutionUnavailableFailure>(),
      );
      expect(
        mapCode(ApiErrorCode.dependencyUnavailable, status: 503),
        isA<DependencyUnavailableFailure>(),
      );
      expect(
        mapCode(ApiErrorCode.jurisdictionDeclarationUnavailable, status: 503),
        isA<DependencyUnavailableFailure>(),
      );
    });

    test('conflict codes', () {
      for (final code in <String>[
        ApiErrorCode.bindingConflict,
        ApiErrorCode.membershipRevokedConcurrently,
        ApiErrorCode.invitationNotRedeemable,
        ApiErrorCode.alreadyMember,
        ApiErrorCode.invalidStatusTransition,
      ]) {
        expect(mapCode(code, status: 409), isA<ConflictFailure>(), reason: code);
      }
    });

    test('validation codes', () {
      for (final code in <String>[
        ApiErrorCode.invalidTenantSelection,
        ApiErrorCode.invalidProfileField,
        ApiErrorCode.noApprovedFieldChanges,
        ApiErrorCode.invalidInvitationInput,
        ApiErrorCode.invalidJurisdictionDeclaration,
      ]) {
        expect(mapCode(code), isA<InvalidRequestFailure>(), reason: code);
      }
    });

    test('not-found codes', () {
      for (final code in <String>[
        ApiErrorCode.invitationNotFound,
        ApiErrorCode.profileNotFound,
        ApiErrorCode.tenantNotFound,
      ]) {
        expect(mapCode(code, status: 404), isA<NotFoundFailure>(), reason: code);
      }
    });

    test('rate limiting carries the server-advertised wait', () {
      final problem = ProblemDetails.tryParse(
        problemBody(ApiErrorCode.rateLimited, status: 429),
        statusCode: 429,
      )!
          .withRetryAfter(const Duration(seconds: 30));

      final failure = mapper.map(statusCode: 429, problem: problem);

      expect(failure, isA<RateLimitedFailure>());
      expect((failure as RateLimitedFailure).retryAfter, const Duration(seconds: 30));
    });
  });

  group('status fallback', () {
    test('an unknown code falls back to the status, never to success', () {
      final problem = ProblemDetails.tryParse(
        problemBody('SOMETHING_THE_CLIENT_HAS_NOT_SHIPPED_YET', status: 403),
        statusCode: 403,
      );

      final failure = mapper.map(statusCode: 403, problem: problem);

      expect(failure, isA<NotAuthorizedFailure>());
      expect(failure.code, 'SOMETHING_THE_CLIENT_HAS_NOT_SHIPPED_YET');
    });

    test('maps bare statuses', () {
      expect(mapper.map(statusCode: 400), isA<InvalidRequestFailure>());
      expect(mapper.map(statusCode: 422), isA<InvalidRequestFailure>());
      expect(mapper.map(statusCode: 401), isA<AuthenticationRequiredFailure>());
      expect(mapper.map(statusCode: 403), isA<NotAuthorizedFailure>());
      expect(mapper.map(statusCode: 404), isA<NotFoundFailure>());
      expect(mapper.map(statusCode: 409), isA<ConflictFailure>());
      expect(mapper.map(statusCode: 429), isA<RateLimitedFailure>());
      expect(mapper.map(statusCode: 502), isA<DependencyUnavailableFailure>());
      expect(mapper.map(statusCode: 503), isA<DependencyUnavailableFailure>());
      expect(mapper.map(statusCode: 504), isA<DependencyUnavailableFailure>());
      expect(mapper.map(statusCode: 500), isA<UnexpectedFailure>());
      expect(mapper.map(statusCode: 418), isA<UnexpectedFailure>());
    });
  });

  group('correlation', () {
    test('the echoed requestId wins over the locally generated id', () {
      final problem = ProblemDetails.tryParse(
        problemBody(ApiErrorCode.bootstrapUnavailable, status: 503, requestId: 'server-echo'),
        statusCode: 503,
      );

      final failure = mapper.map(
        statusCode: 503,
        problem: problem,
        correlationId: 'client-generated',
      );

      expect(failure.correlationId, 'server-echo');
    });

    test('the locally generated id is used when nothing was echoed', () {
      final failure = mapper.map(statusCode: 500, correlationId: 'client-generated');

      expect(failure.correlationId, 'client-generated');
    });
  });

  test('no mapped failure carries server prose', () {
    final problem = ProblemDetails.tryParse(
      problemBody(
        ApiErrorCode.notAuthorized,
        status: 403,
        detail: 'user@example.invalid is not permitted',
      ),
      statusCode: 403,
    );

    final failure = mapper.map(statusCode: 403, problem: problem);

    expect(failure.toString(), isNot(contains('user@example.invalid')));
  });
}
