// GENERATED CODE — DO NOT MODIFY BY HAND.
//
// Typed operations for the Karar API.
//
// Source:     packages/api-contracts/openapi/openapi.yaml
// Contract:   Karar API 0.5.0
// Digest:     a3e666d2
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
  Future<JsonMap> identityChangePassword({
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
    return response.requireObject(location: 'identityChangePassword');
  }

  /// Request a password-reset token
  ///
  /// Always 202 — existing, unknown, disabled, and cooling-down (60s per account) addresses are indistinguishable. The token travels only in the e-mail.
  ///
  /// `POST /auth/forgot-password` — unauthenticated.
  Future<JsonMap> identityForgotPassword({
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
    return response.requireObject(location: 'identityForgotPassword');
  }

  /// List the caller's live sessions
  ///
  /// Owner-scoped by FORCEd row-level security. Metadata is minimized at the edge: a coarse user-agent summary; no raw addresses or user agents.
  ///
  /// `GET /auth/sessions` — requires a session.
  Future<JsonMap> identityListSessions({
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
    return response.requireObject(location: 'identityListSessions');
  }

  /// Password login
  ///
  /// One generic 401 covers unknown address, wrong password, disabled account, and an engaged lockout. Accounts with confirmed MFA receive a 5-minute challenge token instead of a session.
  ///
  /// `POST /auth/login` — unauthenticated.
  Future<JsonMap> identityLogin({
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
    return response.requireObject(location: 'identityLogin');
  }

  /// Revoke the current session
  ///
  /// `POST /auth/logout` — requires a session.
  Future<JsonMap> identityLogout({
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
    return response.requireObject(location: 'identityLogout');
  }

  /// Complete an MFA login with a TOTP code
  ///
  /// Exchanges the login-issued challenge token plus a current TOTP code (±30s window) for a session. Budget 10/15m per account, fail closed.
  ///
  /// `POST /auth/mfa/challenge` — unauthenticated.
  Future<JsonMap> identityMfaChallenge({
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
    return response.requireObject(location: 'identityMfaChallenge');
  }

  /// Prove possession and activate MFA
  ///
  /// Returns the ten one-time recovery codes EXACTLY ONCE.
  ///
  /// `POST /auth/mfa/confirm` — requires a session.
  Future<JsonMap> identityMfaConfirm({
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
    return response.requireObject(location: 'identityMfaConfirm');
  }

  /// Disable MFA (requires a current TOTP or recovery code)
  ///
  /// Destroys the recovery-code set; audited and notified.
  ///
  /// `POST /auth/mfa/disable` — requires a session.
  Future<JsonMap> identityMfaDisable({
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
    return response.requireObject(location: 'identityMfaDisable');
  }

  /// Start TOTP enrolment
  ///
  /// Returns the shared secret and otpauth URL EXACTLY ONCE; the secret is stored encrypted (key-version provenance) and never retrievable again.
  ///
  /// `POST /auth/mfa/enroll` — requires a session.
  Future<JsonMap> identityMfaEnroll({
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
    return response.requireObject(location: 'identityMfaEnroll');
  }

  /// Complete an MFA login with a one-time recovery code
  ///
  /// Each code works once. Five failed recovery attempts per account in 15 minutes lock recovery for the remainder of the window (the counter never resets on lock).
  ///
  /// `POST /auth/mfa/recovery` — unauthenticated.
  Future<JsonMap> identityMfaRecovery({
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
    return response.requireObject(location: 'identityMfaRecovery');
  }

  /// Rotate a refresh token
  ///
  /// One-time: the presented token is consumed and a successor returned. Presenting a used or superseded token is treated as theft — the family and its session are revoked, the event recorded, the account notified — and still answers the same generic 401.
  ///
  /// `POST /auth/refresh` — unauthenticated.
  Future<JsonMap> identityRefresh({
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
    return response.requireObject(location: 'identityRefresh');
  }

  /// Register an account and send a verification code
  ///
  /// Enumeration-resistant: an already-registered address returns the SAME 202 body as a fresh registration. The verification code travels only in the e-mail; it is never in a response.
  ///
  /// `POST /auth/register` — unauthenticated.
  Future<JsonMap> identityRegister({
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
    return response.requireObject(location: 'identityRegister');
  }

  /// Re-send the verification code
  ///
  /// Always 202 — unknown, already-verified, disabled, and cooling-down (60s per account) cases are indistinguishable from a successful send.
  ///
  /// `POST /auth/resend-verification` — unauthenticated.
  Future<JsonMap> identityResendVerification({
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
    return response.requireObject(location: 'identityResendVerification');
  }

  /// Consume a reset token and set a new password
  ///
  /// One-time, 30-minute token. Completing a reset revokes EVERY session and refresh-token family and bumps the token version.
  ///
  /// `POST /auth/reset-password` — unauthenticated.
  Future<JsonMap> identityResetPassword({
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
    return response.requireObject(location: 'identityResetPassword');
  }

  /// Revoke every session except the current one
  ///
  /// `POST /auth/sessions/revoke-others` — requires a session.
  Future<JsonMap> identityRevokeOtherSessions({
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
    return response.requireObject(location: 'identityRevokeOtherSessions');
  }

  /// Revoke one of the caller's sessions
  ///
  /// `DELETE /auth/sessions/{sessionId}` — requires a session.
  Future<JsonMap> identityRevokeSession({
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
    return response.requireObject(location: 'identityRevokeSession');
  }

  /// Consume a one-time e-mail verification code
  ///
  /// One generic failure for wrong, expired, capped, or unknown codes. Verifying an already-verified account is an idempotent success.
  ///
  /// `POST /auth/verify-email` — unauthenticated.
  Future<JsonMap> identityVerifyEmail({
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
    return response.requireObject(location: 'identityVerifyEmail');
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
