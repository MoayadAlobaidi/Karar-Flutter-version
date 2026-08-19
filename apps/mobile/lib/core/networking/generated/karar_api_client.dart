// GENERATED CODE — DO NOT MODIFY BY HAND.
//
// Typed operations for the Karar API.
//
// Source:     packages/api-contracts/openapi/openapi.yaml
// Contract:   Karar API 0.6.0
// Digest:     5b91c963
// Generator:  tool/generate_api_client.dart 1.0.0
//
// Regenerate:  dart run tool/generate_api_client.dart
// Drift check: dart run tool/generate_api_client.dart --check

// The client is written against `ApiTransport`, not against an HTTP library.
// Authentication, refresh, retry, correlation and failure mapping all live in
// the transport; this file only knows the contract.
//
// Every method throws `ApiException` carrying a typed `Failure` on any
// non-2xx response or transport error. Repository implementations catch it and
// return `Failed(failure)`.
//
// An operation whose contract documents no response schema returns the decoded
// JSON object as `JsonMap`. That is deliberate: inventing a type for a
// prose-only response would be a claim the contract does not make.

import '../../utilities/cancellation.dart';
import '../api_transport.dart';
import '../http_method.dart';
import '../timeouts.dart';
import 'models.dart';

/// Typed access to every operation in the contract.
final class KararApiClient {
  const KararApiClient(this._transport);

  final ApiTransport _transport;

  /// Assign a category to the caller's own transaction
  ///
  /// A person's choice. `assignmentSource` is USER on this route and nothing else: a rule-sourced assignment is written by the deterministic categoriser during an import, never by a client claiming to be one. There is no confidence, no score and no suggestion here — none exists in this platform, and a client that invented one would be presenting a guess as a fact.
  /// A USER assignment already in place is not superseded by anything but another USER assignment. The previous assignment is preserved and marked SUPERSEDED; nothing is overwritten.
  ///
  /// `PUT /financial/transactions/{transactionId}/category` — requires a session.
  Future<CategoryAssignmentViewDto> assignOwnTransactionCategory({
    required String transactionId,
    required AssignOwnTransactionCategoryRequestDto body,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.put,
        path: '/financial/transactions/${Uri.encodeComponent(transactionId)}/category',
        body: body.toJson(),
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return CategoryAssignmentViewDto.fromJson(response.requireObject(location: 'assignOwnTransactionCategory'));
  }

  /// Commit the reviewed import, writing its valid rows as transactions
  ///
  /// The one operation on this surface that creates financial records. It is atomic and idempotent: a retry after a successful commit answers 200 with `alreadyCommitted` true and writes nothing.
  /// `expectedVersion` is required. A blind commit could apply a decision the subject took against a different parse.
  /// A reconciliation MISMATCH blocks the commit (409). Committing a statement whose own stated balance disagrees with its rows would write records nobody can trust and would be discovered, if at all, months later.
  ///
  /// `POST /financial/statement-imports/{importId}/commit` — requires a session.
  Future<StatementImportCommittedViewDto> commitOwnStatementImport({
    required String importId,
    required CommitOwnStatementImportRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/financial/statement-imports/${Uri.encodeComponent(importId)}/commit',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return StatementImportCommittedViewDto.fromJson(response.requireObject(location: 'commitOwnStatementImport'));
  }

  /// Confirm that two of the caller's transactions were one movement of their money
  ///
  /// The subject's own decision, and the only thing that makes a match authoritative. The moment of the decision is taken from the server's clock and is never accepted from the caller — a client-supplied decision time is a client-supplied fact about a person's intent.
  /// Idempotent: confirming an already-confirmed match answers 200 with the current row and does not bump its version.
  ///
  /// `POST /financial/transfer-matches/{matchId}/confirmation` — requires a session.
  Future<TransferMatchViewDto> confirmOwnTransferMatch({
    required String matchId,
    required ConfirmOwnTransferMatchRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/financial/transfer-matches/${Uri.encodeComponent(matchId)}/confirmation',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return TransferMatchViewDto.fromJson(response.requireObject(location: 'confirmOwnTransferMatch'));
  }

  /// Correct the caller's own transaction, appending a revision
  ///
  /// A CORRECTION, not an overwrite: the previous values stay in the revision history and the imported value remains attributable. `expectedVersion` is required — a blind correction would silently discard a concurrent one.
  /// The correctable set is deliberately narrow. The account, the currency, the source instant and the source timezone are NOT correctable: changing them would make the record a different record while keeping its history, which is how a corrected row becomes an untraceable one. A body that changes nothing is refused (code NO_CHANGE) rather than recorded as a revision that says nothing.
  /// `magnitude` and `direction` travel together or not at all.
  ///
  /// `PATCH /financial/transactions/{transactionId}` — requires a session.
  Future<TransactionViewDto> correctOwnTransaction({
    required String transactionId,
    required CorrectOwnTransactionRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.patch,
        path: '/financial/transactions/${Uri.encodeComponent(transactionId)}',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return TransactionViewDto.fromJson(response.requireObject(location: 'correctOwnTransaction'));
  }

  /// Create an account the caller is entering by hand
  ///
  /// A MANUAL account. `origin` is fixed to MANUAL by the use case and is not accepted from the caller; neither is `status`, which starts ACTIVE. An account of origin EXTERNAL_PROVIDER is not constructible anywhere in this platform, and there is no request field through which it could be asked for.
  /// An issuer may be named EITHER by catalogue reference OR by the subject's own label, never both: two names for one issuer is a rule violation, not a merge.
  ///
  /// `POST /financial/accounts` — requires a session.
  Future<FinancialAccountViewDto> createOwnManualFinancialAccount({
    required CreateOwnManualFinancialAccountRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/financial/accounts',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return FinancialAccountViewDto.fromJson(response.requireObject(location: 'createOwnManualFinancialAccount'));
  }

  /// Record a transaction the caller is entering by hand
  ///
  /// Manual entry. The caller supplies a NON-NEGATIVE magnitude and a direction; the server applies the canonical sign. A signed amount is not accepted, because a client that gets the sign backwards writes a wrong financial record that looks exactly like a right one.
  /// `sourceKind` is fixed to MANUAL by the use case and is not a request field. Provenance is written for every stored value, and the revision history starts at revision 1.
  /// The account is resolved through a port before the write is accepted: an account that is archived, closed or in a state this platform does not recognise refuses the write rather than accepting a record nobody can correct.
  ///
  /// `POST /financial/transactions` — requires a session.
  Future<TransactionViewDto> createOwnManualTransaction({
    required CreateOwnManualTransactionRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/financial/transactions',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return TransactionViewDto.fromJson(response.requireObject(location: 'createOwnManualTransaction'));
  }

  /// Create a draft statement import against one of the caller's accounts
  ///
  /// Starts the sequence in state DRAFT. The retention decision for the source bytes and the staged rows is resolved HERE, before a single durable source byte can exist: an environment with no approved decision is refused (422) rather than allowed to write and decide later.
  /// The target account is resolved through a port and must be writable; an archived or closed account refuses the import rather than accepting one that could never be committed.
  ///
  /// `POST /financial/statement-imports` — requires a session.
  Future<StatementImportViewDto> createOwnStatementImport({
    required CreateOwnStatementImportRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/financial/statement-imports',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return StatementImportViewDto.fromJson(response.requireObject(location: 'createOwnStatementImport'));
  }

  /// Invite an email address into the caller's own tenant
  ///
  /// Requires an ACTIVE membership and the tenancy.invitation.create permission. The response carries the bearer token ONCE; only its sha256 is stored and no endpoint ever returns it again.
  ///
  /// `POST /tenancy/invitations` — requires a session.
  Future<CreateTenantInvitationResponseDto> createTenantInvitation({
    required CreateTenantInvitationRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/tenancy/invitations',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return CreateTenantInvitationResponseDto.fromJson(response.requireObject(location: 'createTenantInvitation'));
  }

  /// Declare the caller's own jurisdiction (unverified)
  ///
  /// Records the authenticated subject's own jurisdiction so that onboarding can proceed: without an assignment there is no governing jurisdiction, no PolicyPack resolves for the subject, and consent acceptance can pin no provenance.
  /// The result is ALWAYS an UNVERIFIED, USER_DECLARED assignment. Verification is a separate, provider-sourced assignment this route cannot create, and the response states the resulting verification state explicitly so a client cannot mistake a successful declaration for verification.
  /// Re-declaring the jurisdiction already in effect is a no-op that returns the standing assignment with `recorded: false`, so a client retry does not churn the assignment history.
  ///
  /// `POST /jurisdiction/self-declaration` — requires a session.
  Future<DeclaredJurisdictionDto> declareOwnJurisdiction({
    required DeclareOwnJurisdictionRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/jurisdiction/self-declaration',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return DeclaredJurisdictionDto.fromJson(response.requireObject(location: 'declareOwnJurisdiction'));
  }

  /// Delete the caller's own transaction and the transfer matches naming it
  ///
  /// The transaction and the transfer-match relationships that name it. The two are NOT one unit of work — they live in different modules behind separate ports — so a partial outcome is a real answer and this contract states it rather than rounding it to success.
  /// A 200 means everything named below was erased. A 207 means the delete began and did not finish; the body says exactly how far it got, so an operator has something to act on instead of a retry that may or may not be idempotent.
  ///
  /// `DELETE /financial/transactions/{transactionId}` — requires a session.
  Future<TransactionDeletionOutcomeViewDto> deleteOwnTransaction({
    required String transactionId,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.delete,
        path: '/financial/transactions/${Uri.encodeComponent(transactionId)}',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return TransactionDeletionOutcomeViewDto.fromJson(response.requireObject(location: 'deleteOwnTransaction'));
  }

  /// Erase the caller's own statement import, its stored source and its staged rows
  ///
  /// Erasure, not cancellation. The encrypted source object and every staged row go; the import row remains in state ERASED so the subject's own history does not silently lose an entry. An import that is mid-commit is refused rather than torn in half.
  /// Transactions already committed from this import are NOT erased here. They are ordinary financial records of the subject's, with their own deletion path, and removing them as a side effect of tidying an import would delete data the person never asked to lose.
  /// AN IMPORT THAT PRODUCED TRANSACTIONS CANNOT BE ERASED, and answers 409. The rule belongs to the module: an import may not reach ERASED while it still reports a committed-transaction count, because the count is the only remaining statement that those records came from a file somebody reviewed. The refusal is stated rather than rounded to a 200 — a 200 would tell a person their statement is gone when nothing was erased.
  ///
  /// `DELETE /financial/statement-imports/{importId}` — requires a session.
  Future<StatementImportErasedViewDto> eraseOwnStatementImport({
    required String importId,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.delete,
        path: '/financial/statement-imports/${Uri.encodeComponent(importId)}',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return StatementImportErasedViewDto.fromJson(response.requireObject(location: 'eraseOwnStatementImport'));
  }

  /// Read the caller's own tenant and their own membership
  ///
  /// `GET /tenancy/tenant` — requires a session.
  Future<GetOwnTenantResponseDto> getOwnTenant({
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/tenancy/tenant',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return GetOwnTenantResponseDto.fromJson(response.requireObject(location: 'getOwnTenant'));
  }

  /// Read the authenticated principal's own profile
  ///
  /// `GET /users/me` — requires a session.
  Future<UserProfileDto> getOwnUserProfile({
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/users/me',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return UserProfileDto.fromJson(response.requireObject(location: 'getOwnUserProfile'));
  }

  /// The authenticated client's bootstrap context
  ///
  /// Returns the caller's user/session context, tenant-binding state, jurisdiction assignment and verification status, operating-entity reference, PolicyPack version/status, and client-visible capabilities with actionable requirements.
  /// SIDE EFFECT (documented on purpose): when the session is UNBOUND and the caller holds EXACTLY ONE active membership in an active tenant, this endpoint AUTO-BINDS the session to that tenant before answering (no token rotation — existing tokens keep working and pick the binding up server-side). The auto-bind is audited. With zero usable memberships the state is UNBOUND; with several it is TENANT_SELECTION_REQUIRED and binding requires an explicit POST /platform/tenant-binding.
  ///
  /// `GET /platform/bootstrap` — requires a session.
  Future<BootstrapContextDto> getPlatformBootstrap({
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/platform/bootstrap',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return BootstrapContextDto.fromJson(response.requireObject(location: 'getPlatformBootstrap'));
  }

  /// Change the password (requires the current one)
  ///
  /// Revokes every OTHER session and bumps the token version; the calling session's refresh chain stays valid — refresh to obtain a fresh access token.
  ///
  /// `POST /auth/change-password` — requires a session.
  Future<PasswordChangedResultDto> identityChangePassword({
    required IdentityChangePasswordRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/change-password',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return PasswordChangedResultDto.fromJson(response.requireObject(location: 'identityChangePassword'));
  }

  /// Request a password-reset token
  ///
  /// Always 202 — existing, unknown, disabled, and cooling-down (60s per account) addresses are indistinguishable. The token travels only in the e-mail.
  ///
  /// `POST /auth/forgot-password` — unauthenticated.
  Future<NeutralReceiptDto> identityForgotPassword({
    required IdentityForgotPasswordRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/forgot-password',
        body: body.toJson(),
        requiresAuthentication: false,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return NeutralReceiptDto.fromJson(response.requireObject(location: 'identityForgotPassword'));
  }

  /// List the caller's live sessions
  ///
  /// Owner-scoped by FORCEd row-level security. Metadata is minimized at the edge: a coarse user-agent summary; no raw addresses or user agents.
  ///
  /// `GET /auth/sessions` — requires a session.
  Future<SessionListingDto> identityListSessions({
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/auth/sessions',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return SessionListingDto.fromJson(response.requireObject(location: 'identityListSessions'));
  }

  /// Password login
  ///
  /// One generic 401 covers unknown address, wrong password, disabled account, and an engaged lockout. Accounts with confirmed MFA receive a 5-minute challenge token instead of a session.
  ///
  /// `POST /auth/login` — unauthenticated.
  Future<IdentityLoginResponseDto> identityLogin({
    required IdentityLoginRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/login',
        body: body.toJson(),
        requiresAuthentication: false,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return IdentityLoginResponseDto.fromJson(response.requireObject(location: 'identityLogin'));
  }

  /// Revoke the current session
  ///
  /// `POST /auth/logout` — requires a session.
  Future<LoggedOutResultDto> identityLogout({
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/logout',
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return LoggedOutResultDto.fromJson(response.requireObject(location: 'identityLogout'));
  }

  /// Complete an MFA login with a TOTP code
  ///
  /// Exchanges the login-issued challenge token plus a current TOTP code (±30s window) for a session. Budget 10/15m per account, fail closed.
  ///
  /// `POST /auth/mfa/challenge` — unauthenticated.
  Future<AuthenticatedSessionDto> identityMfaChallenge({
    required IdentityMfaChallengeRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/mfa/challenge',
        body: body.toJson(),
        requiresAuthentication: false,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return AuthenticatedSessionDto.fromJson(response.requireObject(location: 'identityMfaChallenge'));
  }

  /// Prove possession and activate MFA
  ///
  /// Returns the ten one-time recovery codes EXACTLY ONCE.
  ///
  /// `POST /auth/mfa/confirm` — requires a session.
  Future<MfaConfirmedDto> identityMfaConfirm({
    required IdentityMfaConfirmRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/mfa/confirm',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return MfaConfirmedDto.fromJson(response.requireObject(location: 'identityMfaConfirm'));
  }

  /// Disable MFA (requires a current TOTP or recovery code)
  ///
  /// Destroys the recovery-code set; audited and notified.
  ///
  /// `POST /auth/mfa/disable` — requires a session.
  Future<MfaDisabledResultDto> identityMfaDisable({
    required IdentityMfaDisableRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/mfa/disable',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return MfaDisabledResultDto.fromJson(response.requireObject(location: 'identityMfaDisable'));
  }

  /// Start TOTP enrolment
  ///
  /// Returns the shared secret and otpauth URL EXACTLY ONCE; the secret is stored encrypted (key-version provenance) and never retrievable again.
  ///
  /// `POST /auth/mfa/enroll` — requires a session.
  Future<MfaEnrolmentStartedDto> identityMfaEnroll({
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/mfa/enroll',
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return MfaEnrolmentStartedDto.fromJson(response.requireObject(location: 'identityMfaEnroll'));
  }

  /// Complete an MFA login with a one-time recovery code
  ///
  /// Each code works once. Five failed recovery attempts per account in 15 minutes lock recovery for the remainder of the window (the counter never resets on lock).
  ///
  /// `POST /auth/mfa/recovery` — unauthenticated.
  Future<AuthenticatedSessionDto> identityMfaRecovery({
    required IdentityMfaRecoveryRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/mfa/recovery',
        body: body.toJson(),
        requiresAuthentication: false,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return AuthenticatedSessionDto.fromJson(response.requireObject(location: 'identityMfaRecovery'));
  }

  /// Rotate a refresh token
  ///
  /// One-time: the presented token is consumed and a successor returned. Presenting a used or superseded token is treated as theft — the family and its session are revoked, the event recorded, the account notified — and still answers the same generic 401.
  ///
  /// `POST /auth/refresh` — unauthenticated.
  Future<RefreshedSessionDto> identityRefresh({
    required IdentityRefreshRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/refresh',
        body: body.toJson(),
        requiresAuthentication: false,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return RefreshedSessionDto.fromJson(response.requireObject(location: 'identityRefresh'));
  }

  /// Register an account and send a verification code
  ///
  /// Enumeration-resistant: an already-registered address returns the SAME 202 body as a fresh registration. The verification code travels only in the e-mail; it is never in a response.
  ///
  /// `POST /auth/register` — unauthenticated.
  Future<NeutralReceiptDto> identityRegister({
    required IdentityRegisterRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/register',
        body: body.toJson(),
        requiresAuthentication: false,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return NeutralReceiptDto.fromJson(response.requireObject(location: 'identityRegister'));
  }

  /// Re-send the verification code
  ///
  /// Always 202 — unknown, already-verified, disabled, and cooling-down (60s per account) cases are indistinguishable from a successful send.
  ///
  /// `POST /auth/resend-verification` — unauthenticated.
  Future<NeutralReceiptDto> identityResendVerification({
    required IdentityResendVerificationRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/resend-verification',
        body: body.toJson(),
        requiresAuthentication: false,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return NeutralReceiptDto.fromJson(response.requireObject(location: 'identityResendVerification'));
  }

  /// Consume a reset token and set a new password
  ///
  /// One-time, 30-minute token. Completing a reset revokes EVERY session and refresh-token family and bumps the token version.
  ///
  /// `POST /auth/reset-password` — unauthenticated.
  Future<PasswordResetResultDto> identityResetPassword({
    required IdentityResetPasswordRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/reset-password',
        body: body.toJson(),
        requiresAuthentication: false,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return PasswordResetResultDto.fromJson(response.requireObject(location: 'identityResetPassword'));
  }

  /// Revoke every session except the current one
  ///
  /// `POST /auth/sessions/revoke-others` — requires a session.
  Future<OtherSessionsRevokedDto> identityRevokeOtherSessions({
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/sessions/revoke-others',
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return OtherSessionsRevokedDto.fromJson(response.requireObject(location: 'identityRevokeOtherSessions'));
  }

  /// Revoke one of the caller's sessions
  ///
  /// `DELETE /auth/sessions/{sessionId}` — requires a session.
  Future<SessionRevokedResultDto> identityRevokeSession({
    required String sessionId,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.delete,
        path: '/auth/sessions/${Uri.encodeComponent(sessionId)}',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return SessionRevokedResultDto.fromJson(response.requireObject(location: 'identityRevokeSession'));
  }

  /// Consume a one-time e-mail verification code
  ///
  /// One generic failure for wrong, expired, capped, or unknown codes. Verifying an already-verified account is an idempotent success.
  ///
  /// `POST /auth/verify-email` — unauthenticated.
  Future<EmailVerifiedResultDto> identityVerifyEmail({
    required IdentityVerifyEmailRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/auth/verify-email',
        body: body.toJson(),
        requiresAuthentication: false,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return EmailVerifiedResultDto.fromJson(response.requireObject(location: 'identityVerifyEmail'));
  }

  /// List the legal documents applicable to the caller, with their effective versions
  ///
  /// Documents for the operating entity effective for the caller (user contracting binding first, tenant default second), each with its currently effective published version. A document without an effective version has nothing to accept yet.
  ///
  /// `GET /consent/documents` — requires a session.
  Future<ListApplicableConsentDocumentsResponseDto> listApplicableConsentDocuments({
    String? jurisdictionRef,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/consent/documents',
        query: <String, Object?>{
          'jurisdictionRef': jurisdictionRef,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListApplicableConsentDocumentsResponseDto.fromJson(response.requireObject(location: 'listApplicableConsentDocuments'));
  }

  /// List the jurisdiction references the caller may declare
  ///
  /// The register entries `POST /jurisdiction/self-declaration` accepts, so a client can offer a chooser instead of a free-text field that would invite an identifier the register does not hold. It is a READ: it writes nothing, activates no PolicyPack, and approves nothing.
  /// The listing and the declaration decide declarability through the same rule, so an entry offered here is an entry the declaration accepts. Retired entries, entries outside their reviewed effective window, and entries whose country does not resolve are omitted — fail closed.
  /// SELECTABLE IS NOT APPROVED. `approvalRecorded` is stated on every entry and is false for all of them: no jurisdiction in this register is legally approved, and declaring one records an UNVERIFIED assignment that clears no capability.
  /// Authentication is required; a tenant binding is NOT — an onboarding client needs the chooser before it can bind. The declaration itself keeps its own binding requirement.
  /// SAFE FIELDS ONLY. The register's governance record — the provenance of each declaration, the lifecycle stage, the review status, the reviewed effective window — is internal and appears nowhere in this response.
  ///
  /// `GET /jurisdiction/declarable-references` — requires a session.
  Future<ListDeclarableJurisdictionReferencesResponseDto> listDeclarableJurisdictionReferences({
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/jurisdiction/declarable-references',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListDeclarableJurisdictionReferencesResponseDto.fromJson(response.requireObject(location: 'listDeclarableJurisdictionReferences'));
  }

  /// List the reviewed category catalogue
  ///
  /// Non-personal reference data, identical for every principal. The catalogue changes by reviewed migration; there is no runtime write path, and a subject's own label never becomes a catalogue row.
  /// A RETIRED entry is listed with its `retiredAt` so an existing assignment remains readable, and `assignable` states plainly whether it may be chosen now — a client should not have to derive that from a timestamp.
  ///
  /// `GET /financial/categories` — requires a session.
  Future<ListFinancialCategoriesResponseDto> listFinancialCategories({
    int? limit,
    String? cursor,
    bool? assignable,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/categories',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
          'assignable': assignable,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListFinancialCategoriesResponseDto.fromJson(response.requireObject(location: 'listFinancialCategories'));
  }

  /// List the reviewed issuers a new account may point at
  ///
  /// The platform's reviewed issuer catalogue — one row per issuer globally (ADR-0028). This is PUBLIC reference data with no tenant, user or subject column: every principal reads the same rows, and authentication is required only because the whole financial surface is authenticated.
  /// Only entries selectable for a NEW account are listed. A RETIRED entry is still resolvable through an account that already points at it (an existing record has to render its issuer's name), but it is not offered here.
  /// Market presence per country lives in a separate table (`institution_markets`, migration 0094) and is NOT exposed by this operation: the module declares no reader for it, and an operation that answered from nothing would be a false claim.
  ///
  /// `GET /financial/institutions` — requires a session.
  Future<ListFinancialInstitutionsResponseDto> listFinancialInstitutions({
    int? limit,
    String? cursor,
    InstitutionKindDto? kind,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/institutions',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
          'kind': kind,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListFinancialInstitutionsResponseDto.fromJson(response.requireObject(location: 'listFinancialInstitutions'));
  }

  /// List the balances a SOURCE reported for the caller's account
  ///
  /// Source-REPORTED balances, most recently true first. Nothing here is derived: no figure on this route is computed from transactions, and no `balanceKind` is substituted for another. A caller asking what is available receives what a source said was available, or nothing — never a settled figure wearing another label (ADR-0028).
  /// `balanceKind` is stated on every row and is never defaulted. `sourceKind` says where the figure came from; MANUAL and CSV are the only values a figure can currently carry, because they are the only rails that run.
  ///
  /// `GET /financial/accounts/{accountId}/balances` — requires a session.
  Future<ListOwnAccountBalanceSnapshotsResponseDto> listOwnAccountBalanceSnapshots({
    required String accountId,
    int? limit,
    String? cursor,
    BalanceKindDto? balanceKind,
    SourceKindDto? sourceKind,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/accounts/${Uri.encodeComponent(accountId)}/balances',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
          'balanceKind': balanceKind,
          'sourceKind': sourceKind,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListOwnAccountBalanceSnapshotsResponseDto.fromJson(response.requireObject(location: 'listOwnAccountBalanceSnapshots'));
  }

  /// List the safe instrument summaries that spend from one of the caller's accounts
  ///
  /// The cards and QR payment identities that spend from ONE of the AUTHENTICATED principal's own accounts. Another subject's account answers an empty page — the route is not an existence oracle — and there is no operation anywhere that reads somebody else's instruments.
  /// Deliberately absent from every row, and to stay absent: any balance, amount, credit limit, available figure or total; any PAN, CVV, expiry, network token or wallet credential; any issuer reference implying a live link; and the row's `tenantId` and `userId`.
  ///
  /// `GET /financial/accounts/{accountId}/payment-instruments` — requires a session.
  Future<ListOwnAccountPaymentInstrumentsResponseDto> listOwnAccountPaymentInstruments({
    required String accountId,
    int? limit,
    String? cursor,
    InstrumentTypeDto? instrumentType,
    InstrumentStatusDto? status,
    bool? spendable,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/accounts/${Uri.encodeComponent(accountId)}/payment-instruments',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
          'instrumentType': instrumentType,
          'status': status,
          'spendable': spendable,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListOwnAccountPaymentInstrumentsResponseDto.fromJson(response.requireObject(location: 'listOwnAccountPaymentInstruments'));
  }

  /// List which sources feed one of the caller's accounts, and how fresh they are
  ///
  /// The safe source and freshness summaries for ONE of the caller's own accounts: which connection feeds it, on which rail, how authoritative that source claims to be, when it was last observed, when it last produced a successful import, what history it covers, and what it was OBSERVED to be capable of.
  /// Freshness is reported as observation, never as health. `lastObservedAt` is the last time this platform saw the source at all; `lastSuccessfulImportAt` is the last time data actually landed, and it is null rather than approximated when none has. Capabilities are OBSERVED / NOT_OBSERVED / NOT_PROVIDED — a capability nobody looked for is not the same answer as one that was looked for and absent.
  /// There is no confidence figure. A link is matched on an EXACT external reference or it is PROBABLE and waits for the person to say; a percentage would be a number nobody computed.
  /// Deliberately absent from every row, and to stay absent: the external account reference itself, its keyed fingerprint and the fingerprint version, the reference scheme, and the row's tenant and user.
  ///
  /// `GET /financial/accounts/{accountId}/source-links` — requires a session.
  Future<ListOwnAccountSourceLinksResponseDto> listOwnAccountSourceLinks({
    required String accountId,
    int? limit,
    String? cursor,
    ConnectionRailDto? rail,
    SourceLinkStatusDto? status,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/accounts/${Uri.encodeComponent(accountId)}/source-links',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
          'rail': rail,
          'status': status,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListOwnAccountSourceLinksResponseDto.fromJson(response.requireObject(location: 'listOwnAccountSourceLinks'));
  }

  /// List the caller's own accounts and wallets
  ///
  /// The accounts and wallets the AUTHENTICATED principal owns, and no others. There is no operation anywhere on this surface that reads another subject's accounts, and no parameter that could name one.
  /// Ordering is stable (oldest first) so the cursor means the same thing between calls. Filters narrow the caller's OWN set; they never widen it.
  ///
  /// `GET /financial/accounts` — requires a session.
  Future<ListOwnFinancialAccountsResponseDto> listOwnFinancialAccounts({
    int? limit,
    String? cursor,
    String? institutionId,
    InstitutionKindDto? institutionKind,
    AccountTypeDto? accountType,
    WalletKindDto? walletKind,
    AccountNatureDto? nature,
    String? currency,
    AccountStatusDto? status,
    AccountOriginDto? origin,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/accounts',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
          'institutionId': institutionId,
          'institutionKind': institutionKind,
          'accountType': accountType,
          'walletKind': walletKind,
          'nature': nature,
          'currency': currency,
          'status': status,
          'origin': origin,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListOwnFinancialAccountsResponseDto.fromJson(response.requireObject(location: 'listOwnFinancialAccounts'));
  }

  /// List the caller's own data connections, as safe summaries
  ///
  /// The connections the AUTHENTICATED principal owns, oldest first. Each row says which rail it is, whether that rail can actually run, and — in the same object — that it implies no live institution link. A client has everything it needs to render an honest state and nothing it could render as a connection to a bank.
  ///
  /// `GET /financial/connections` — requires a session.
  Future<ListOwnFinancialConnectionsResponseDto> listOwnFinancialConnections({
    int? limit,
    String? cursor,
    ConnectionRailDto? rail,
    ConnectionStatusDto? status,
    String? institutionId,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/connections',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
          'rail': rail,
          'status': status,
          'institutionId': institutionId,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListOwnFinancialConnectionsResponseDto.fromJson(response.requireObject(location: 'listOwnFinancialConnections'));
  }

  /// List what the parse found, as safe row errors, one page at a time
  ///
  /// The review surface. It reports COUNTS and ROW ERRORS, and deliberately no row content: no cell, no amount, no merchant, no balance and no staged fingerprint crosses this boundary. A person deciding whether to commit needs to know how many rows are valid, how many are duplicates and which rows failed and why — none of which requires the file's contents to be echoed back.
  /// The underlying report is bounded by the central policy's `maxReportedErrors`, and this route pages within that bound. Both counts are carried: `reportedErrorCount` is what the report holds and `totalErrorCount` is what really failed, so a truncated report can never read as a complete one.
  ///
  /// `GET /financial/statement-imports/{importId}/preview` — requires a session.
  Future<StatementImportPreviewViewDto> listOwnStatementImportPreview({
    required String importId,
    int? limit,
    String? cursor,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/statement-imports/${Uri.encodeComponent(importId)}/preview',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return StatementImportPreviewViewDto.fromJson(response.requireObject(location: 'listOwnStatementImportPreview'));
  }

  /// List the caller's OWN memberships, across tenants
  ///
  /// Every membership the AUTHENTICATED caller holds that is ACTIVE and inside its effective window right now — the set of tenants they may bind to. This is what makes tenant switching reachable from a bound session: the bootstrap surface reports the CURRENT binding only, so without this read a client has no switch target to offer.
  /// Authentication is required; a tenant binding deliberately is NOT. Selection precedes binding, so the read must work before a binding exists — and it is never narrowed to the current one when it does.
  /// OWN means own. There is no user or tenant parameter anywhere: the subject is the session's subject, RLS bounds the rows to the caller's own, and a `?userId=`, `?tenantId=`, or `x-tenant-id` is ignored by construction (asserted by test). An empty array is a real answer — this caller holds no usable membership anywhere; a read that could not be performed is 503.
  ///
  /// `GET /tenancy/memberships` — requires a session.
  Future<ListOwnTenantMembershipsResponseDto> listOwnTenantMemberships({
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/tenancy/memberships',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListOwnTenantMembershipsResponseDto.fromJson(response.requireObject(location: 'listOwnTenantMemberships'));
  }

  /// List the safe provenance of the caller's own transaction
  ///
  /// Where each revision of this record came from — the rail, the acting subject's own account reference, the four processing versions, the direction the source stated and how it was mapped onto the canonical sign, and whether the category was chosen by a person or by a rule.
  /// SAFE means the field set is closed and the identifying parts are not in it. Deliberately absent: the dedup fingerprint and the occurrence ordinal (a per-subject keyed MAC, whose publication would make this route a confirmation oracle), the import's row reference and any raw source cell or header text, the acting actor reference, and the row's tenant and user.
  ///
  /// `GET /financial/transactions/{transactionId}/provenance` — requires a session.
  Future<ListOwnTransactionProvenanceResponseDto> listOwnTransactionProvenance({
    required String transactionId,
    int? limit,
    String? cursor,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/transactions/${Uri.encodeComponent(transactionId)}/provenance',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListOwnTransactionProvenanceResponseDto.fromJson(response.requireObject(location: 'listOwnTransactionProvenance'));
  }

  /// List the caller's own transactions
  ///
  /// Keyset pagination by `(bookingDate DESC, id DESC)`. The cursor is opaque and encodes a position in the CALLER'S OWN result set; a malformed one is refused (code INVALID_CURSOR) rather than silently reset to the first page, because a silent reset shows a person the wrong month and tells them nothing.
  /// WHERE THE FILTERS ARE APPLIED, stated because it changes how a client pages. `accountId` is applied by the STORE, inside the keyset query. The remaining filters narrow the page the store returned, so a page may come back with fewer items than `limit` — or with none — while `hasMore` is still true. `hasMore` and `nextCursor` always describe the store's own cursor, never the filtered count, so a client keeps following `nextCursor` until it is null rather than stopping at the first sparse page. Pushing the remaining predicates into the keyset query is a change to the store, and this description will change with it.
  /// There is deliberately no category filter. A transaction's active category lives in another table and is read per transaction; a filter here would issue one query per row of every page, and a parameter that quietly cost that much is worse than one that does not exist.
  ///
  /// `GET /financial/transactions` — requires a session.
  Future<ListOwnTransactionsResponseDto> listOwnTransactions({
    int? limit,
    String? cursor,
    String? accountId,
    String? currency,
    MoneyDirectionDto? direction,
    TransactionStatusDto? status,
    SourceKindDto? sourceKind,
    String? bookedFrom,
    String? bookedTo,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/transactions',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
          'accountId': accountId,
          'currency': currency,
          'direction': direction,
          'status': status,
          'sourceKind': sourceKind,
          'bookedFrom': bookedFrom,
          'bookedTo': bookedTo,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListOwnTransactionsResponseDto.fromJson(response.requireObject(location: 'listOwnTransactions'));
  }

  /// List the transfer matches suggested for the caller's own transactions
  ///
  /// Every match the AUTHENTICATED principal owns, newest suggestion first, or one state of them. A client that wants only the decisions still pending asks for `state=SUGGESTED`; a client that wants what the person has actually agreed asks for `state=CONFIRMED`.
  ///
  /// `GET /financial/transfer-matches` — requires a session.
  Future<ListOwnTransferMatchesResponseDto> listOwnTransferMatches({
    int? limit,
    String? cursor,
    MatchStateDto? state,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/transfer-matches',
        query: <String, Object?>{
          'limit': limit,
          'cursor': cursor,
          'state': state,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListOwnTransferMatchesResponseDto.fromJson(response.requireObject(location: 'listOwnTransferMatches'));
  }

  /// List memberships of the caller's own tenant
  ///
  /// Requires an ACTIVE membership and the tenancy.member.read permission (PolicyService, deny-by-default). RLS bounds the rows to the caller's tenant beneath both checks.
  ///
  /// `GET /tenancy/members` — requires a session.
  Future<ListTenantMembersResponseDto> listTenantMembers({
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/tenancy/members',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ListTenantMembersResponseDto.fromJson(response.requireObject(location: 'listTenantMembers'));
  }

  /// Parse the stored source under a stated column mapping
  ///
  /// Reads the stored ciphertext, parses it under the mapping the caller states, normalizes each row, computes deduplication identities and stages the result for review. NOTHING FINANCIAL IS WRITTEN: the import moves to REVIEW_REQUIRED and waits for a person.
  /// THE MAPPING IS BY COLUMN INDEX, never by header text. A header is untrusted content from a file, and matching on it is how a column of dates silently becomes a column of amounts.
  /// CONVENTIONS ARE STATED, NOT GUESSED. A date order, a decimal separator or a direction the file does not make unambiguous produces a typed row error rather than a plausible number. `statedBalance` is what the STATEMENT claims; the parse reconciles against it and reports MATCHED, MISMATCHED or NOT_AVAILABLE, and a mismatch blocks the commit.
  /// Every bound this parse obeys — rows, columns, field bytes, buffered rows, buffered bytes, the wall-clock deadline and the number of reported errors — comes from `INGESTION_LIMIT_POLICIES.csvStatementImport`. None of them is a request field: a caller cannot raise the ceiling it is being held to.
  ///
  /// `POST /financial/statement-imports/{importId}/parse` — requires a session.
  Future<StatementImportViewDto> parseOwnStatementImportSource({
    required String importId,
    required ParseOwnStatementImportSourceRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/financial/statement-imports/${Uri.encodeComponent(importId)}/parse',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return StatementImportViewDto.fromJson(response.requireObject(location: 'parseOwnStatementImportSource'));
  }

  /// Read the text of the document version in force, with its language
  ///
  /// The legal text a subject must READ before accepting, supplied by the platform. The client never composes, summarizes, translates, or substitutes legal wording; when the platform has no content to serve this route says so and the client shows its own unavailable state.
  /// The caller names a DOCUMENT, never a version: the server chooses the version in force, so no unpublished draft and no superseded version is reachable. The document must be the one applicable to the caller (the effective operating entity is resolved server-side); any other entity's document answers 404, exactly as an unknown id does, so the route is not an oracle for the wider catalogue.
  /// WHAT IS SERVED IS WHAT WAS PUBLISHED. The bytes are hashed and compared against the version's pinned `contentHash` before anything is returned; a mismatch is refused (503) rather than displayed with a warning, because a grant pins a version id and reading one text while accepting another is the failure this check exists to prevent.
  /// `language` describes the CONTENT and arrives with it. The catalogue records no language, so the listing carries none — a language field there could only be invented.
  ///
  /// `GET /consent/documents/{documentId}/content` — requires a session.
  Future<ReadConsentDocumentContentResponseDto> readConsentDocumentContent({
    required String documentId,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/consent/documents/${Uri.encodeComponent(documentId)}/content',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ReadConsentDocumentContentResponseDto.fromJson(response.requireObject(location: 'readConsentDocumentContent'));
  }

  /// Read the caller's OWN consent status for a purpose
  ///
  /// Resolves the caller's consent for (purpose, jurisdiction?) against the operating entity effective for them. States: ACTIVE (processing permitted; noticeRequired flags a pending NOTICE_REQUIRED republication), WITHDRAWN, RECONSENT_REQUIRED (a newer MATERIAL_REACCEPTANCE_REQUIRED version is in force — fails closed), and NO_GRANT (no acceptance, or no published document — fails closed).
  ///
  /// `GET /consent/status` — requires a session.
  Future<ReadOwnConsentStatusResponseDto> readOwnConsentStatus({
    required String purposeRef,
    String? jurisdictionRef,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/consent/status',
        query: <String, Object?>{
          'purposeRef': purposeRef,
          'jurisdictionRef': jurisdictionRef,
        },
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ReadOwnConsentStatusResponseDto.fromJson(response.requireObject(location: 'readOwnConsentStatus'));
  }

  /// Read one of the caller's own accounts
  ///
  /// Another subject's account answers 404, exactly as an unknown id does. The route is not an existence oracle for anybody else's records.
  ///
  /// `GET /financial/accounts/{accountId}` — requires a session.
  Future<FinancialAccountViewDto> readOwnFinancialAccount({
    required String accountId,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/accounts/${Uri.encodeComponent(accountId)}',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return FinancialAccountViewDto.fromJson(response.requireObject(location: 'readOwnFinancialAccount'));
  }

  /// Read the state of the caller's own statement import
  ///
  /// Where the import is in the sequence, what the parse produced, and whether it is waiting for the subject to decide. The stored source is reported as EXISTING or not; its locator is never carried.
  /// `version` IS NOT ON THIS RESPONSE, and the absence is a stated limitation rather than an omission. The module exposes exactly one read for a single import and it does not carry the optimistic-concurrency token, so a client takes the `expectedVersion` it needs for the commit from the response to the write it last performed — the upload or the parse — which is where the full import row is handed over. Recovering it after that response is lost requires a read the module does not declare.
  ///
  /// `GET /financial/statement-imports/{importId}` — requires a session.
  Future<StatementImportStatusViewDto> readOwnStatementImport({
    required String importId,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/statement-imports/${Uri.encodeComponent(importId)}',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return StatementImportStatusViewDto.fromJson(response.requireObject(location: 'readOwnStatementImport'));
  }

  /// Read one of the caller's own transactions with its revision history
  ///
  /// The transaction, its append-only revision history oldest first, its active category assignment, and whether the current values DIVERGE from what the source supplied. Divergence is stated rather than implied: an imported value stays attributable after a person corrects it.
  ///
  /// `GET /financial/transactions/{transactionId}` — requires a session.
  Future<ReadOwnTransactionResponseDto> readOwnTransaction({
    required String transactionId,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: '/financial/transactions/${Uri.encodeComponent(transactionId)}',
        requiresAuthentication: true,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return ReadOwnTransactionResponseDto.fromJson(response.requireObject(location: 'readOwnTransaction'));
  }

  /// Record the caller's OWN acceptance of a published document version
  ///
  /// Creates an immutable consent grant pinned to the document's operating entity, jurisdiction, the named purpose, and the exact accepted version (ADR-0024). Any prior ACTIVE grant for the same triple is marked SUPERSEDED in the same transaction. The evidence reference is derived from the request identity server-side, never accepted from the client.
  ///
  /// `POST /consent/acceptances` — requires a session.
  Future<RecordOwnConsentAcceptanceResponseDto> recordOwnConsentAcceptance({
    required RecordOwnConsentAcceptanceRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/consent/acceptances',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return RecordOwnConsentAcceptanceResponseDto.fromJson(response.requireObject(location: 'recordOwnConsentAcceptance'));
  }

  /// Redeem an invitation token as the authenticated principal
  ///
  /// The redeemer must be logged in; they need not (yet) belong to any tenant. The invited email must match the redeemer's identity-verified email — never a client-supplied claim. Redemption is one-time and attempt-capped, runs under the redeemer's own principal context with narrow token-scoped visibility (never platform elevation), and binds the new membership to the authenticated redeemer at the RLS layer.
  ///
  /// `POST /tenancy/invitations/redeem` — requires a session.
  Future<RedeemTenantInvitationResponseDto> redeemTenantInvitation({
    required RedeemTenantInvitationRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/tenancy/invitations/redeem',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return RedeemTenantInvitationResponseDto.fromJson(response.requireObject(location: 'redeemTenantInvitation'));
  }

  /// Reject a suggested match, or withdraw a confirmation
  ///
  /// Legal from SUGGESTED and from CONFIRMED. From CONFIRMED it is how a person withdraws a decision they made — the row is kept, so the platform remembers that this pair was looked at and does not suggest it again as though it never had been.
  /// A rejected match is terminal: it cannot be confirmed afterwards.
  ///
  /// `POST /financial/transfer-matches/{matchId}/rejection` — requires a session.
  Future<TransferMatchViewDto> rejectOwnTransferMatch({
    required String matchId,
    required RejectOwnTransferMatchRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/financial/transfer-matches/${Uri.encodeComponent(matchId)}/rejection',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return TransferMatchViewDto.fromJson(response.requireObject(location: 'rejectOwnTransferMatch'));
  }

  /// Record the principal's intent to disable their account
  ///
  /// Disable/deletion-request FOUNDATION (Phase 3): records the intent (status ACTIVE -> DISABLE_REQUESTED, an append-only status-history row, and an audit event). Nothing acts on the intent yet — session revocation and the disable itself arrive in later phases and consume the recorded state.
  ///
  /// `POST /users/me/disable-request` — requires a session.
  Future<RequestOwnAccountDisableResponseDto> requestOwnAccountDisable({
    RequestOwnAccountDisableRequestDto? body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/users/me/disable-request',
        body: body?.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return RequestOwnAccountDisableResponseDto.fromJson(response.requireObject(location: 'requestOwnAccountDisable'));
  }

  /// Revoke a still-open invitation in the caller's own tenant
  ///
  /// One-time (an already-terminal invitation answers 404, indistinguishable from an unknown or cross-tenant id). Requires an ACTIVE membership and the tenancy.invitation.revoke permission.
  ///
  /// `POST /tenancy/invitations/{invitationId}/revoke` — requires a session.
  Future<RevokeTenantInvitationResponseDto> revokeTenantInvitation({
    required String invitationId,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/tenancy/invitations/${Uri.encodeComponent(invitationId)}/revoke',
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return RevokeTenantInvitationResponseDto.fromJson(response.requireObject(location: 'revokeTenantInvitation'));
  }

  /// Bind the session to a tenant, or switch it to another
  ///
  /// Explicit tenant selection. The body's tenantId is a CHOICE among the caller's own active memberships — the server verifies an ACTIVE membership in an ACTIVE tenant before any binding changes, and an arbitrary, revoked, expired, or disabled-tenant target is refused (403, code MEMBERSHIP_REQUIRED) without revealing whether the tenant exists.
  /// UNBOUND session: FIRST BIND — the session gains the tenant binding with NO token rotation; the response is the bound bootstrap-shaped binding state (kind BOUND, no tokens).
  /// BOUND session: SWITCH — the current session and its refresh-token families are revoked atomically and a BRAND-NEW session bound to the target is issued; the response (kind SWITCHED) carries the NEW access and refresh tokens, and every prior token is dead. If the target membership is revoked concurrently with the switch, the replacement session is revoked too (409, code MEMBERSHIP_REVOKED_CONCURRENTLY) — the caller signs in again; a session is never left bound without membership.
  ///
  /// `POST /platform/tenant-binding` — requires a session.
  Future<SetPlatformTenantBindingResponseDto> setPlatformTenantBinding({
    required SetPlatformTenantBindingRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/platform/tenant-binding',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return SetPlatformTenantBindingResponseDto.fromJson(response.requireObject(location: 'setPlatformTenantBinding'));
  }

  /// Update the caller's own account under an optimistic version
  ///
  /// `expectedVersion` is required: a blind write would silently discard a concurrent edit. A field ABSENT from the body is left alone; a field present as `null` is CLEARED. The two are different requests and the server does not conflate them.
  /// `origin` is immutable and has no field here. `currency` may not change once the account carries records — the refusal is a rule violation, not a conversion.
  ///
  /// `PATCH /financial/accounts/{accountId}` — requires a session.
  Future<FinancialAccountViewDto> updateOwnFinancialAccount({
    required String accountId,
    required UpdateOwnFinancialAccountRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.patch,
        path: '/financial/accounts/${Uri.encodeComponent(accountId)}',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return FinancialAccountViewDto.fromJson(response.requireObject(location: 'updateOwnFinancialAccount'));
  }

  /// Update the approved subject-editable fields (displayName, locale)
  ///
  /// `PATCH /users/me` — requires a session.
  Future<UserProfileDto> updateOwnUserProfile({
    required UpdateOwnUserProfileRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.patch,
        path: '/users/me',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return UserProfileDto.fromJson(response.requireObject(location: 'updateOwnUserProfile'));
  }

  /// Upload the CSV bytes for the caller's own draft import
  ///
  /// The request body is the file itself, as `text/csv`. It is read as a STREAM and never buffered whole before its size is known: the declared `Content-Length` is checked against the central byte bound before a byte is read, and the accumulated length is checked again on every chunk. The request is refused the moment either crosses the bound (code SOURCE_TOO_LARGE), and nothing is truncated to fit.
  /// The bytes are stored only as authenticated ciphertext, outside PostgreSQL. Nothing about that storage — its locator, its algorithm, its key version, its nonce, its auth tag, its checksum — appears in any response.
  /// Re-uploading a file this subject has already committed answers 200 with the import in state DUPLICATE and refusal code SOURCE_ALREADY_IMPORTED, rather than silently importing the same statement twice.
  ///
  /// `POST /financial/statement-imports/{importId}/source` — requires a session.
  Future<StatementImportViewDto> uploadOwnStatementImportSource({
    required String importId,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/financial/statement-imports/${Uri.encodeComponent(importId)}/source',
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return StatementImportViewDto.fromJson(response.requireObject(location: 'uploadOwnStatementImportSource'));
  }

  /// Withdraw the caller's OWN consent grant
  ///
  /// Sets withdrawn_at and status WITHDRAWN on the caller's own ACTIVE grant. The row is preserved as evidence; re-granting later creates a NEW grant. Another subject's grant id is indistinguishable from an unknown one (404) — row-level security scopes the lookup.
  ///
  /// `POST /consent/withdrawals` — requires a session.
  Future<WithdrawOwnConsentResponseDto> withdrawOwnConsent({
    required WithdrawOwnConsentRequestDto body,
    String? idempotencyKey,
    CancellationToken? cancellation,
    TimeoutProfile timeouts = TimeoutProfile.standard,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.post,
        path: '/consent/withdrawals',
        body: body.toJson(),
        requiresAuthentication: true,
        idempotencyKey: idempotencyKey,
        cancellation: cancellation,
        timeouts: timeouts,
      ),
    );
    return WithdrawOwnConsentResponseDto.fromJson(response.requireObject(location: 'withdrawOwnConsent'));
  }
}
