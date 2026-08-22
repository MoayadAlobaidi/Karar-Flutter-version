// Fixtures for this workstream's tests.
//
// NOTHING HERE IS A FINANCIAL VALUE. No balance, no account number, no
// transaction, no amount, no currency, no portfolio, no score. The rule in
// lib/README.md — "no fabricated financial data anywhere, not in a screen, not
// in a fixture, not in a test" — is upheld here, not only in production code,
// because a fixture is exactly where such a value tends to be invented first
// and quoted later.
//
// Identifiers are obviously synthetic and addresses use the reserved
// `.invalid` TLD, so nothing here can be mistaken for a real record.
import 'package:karar_mobile/features/consent/domain/consent_repository.dart';
import 'package:karar_mobile/features/consent/domain/consent_state.dart';
import 'package:karar_mobile/features/consent/domain/legal_document.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/platform_capability.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/platform_context.dart';
import 'package:karar_mobile/features/profile/domain/user_profile.dart';
import 'package:karar_mobile/features/tenant_selection/domain/tenant_binding.dart';

const String testUserId = 'user-0001';
const String testSessionId = 'session-0001';
const String testTenantId = 'tenant-0001';
const String testEntityId = 'entity-0001';
const String testPurposeRef = 'purpose:ai-processing';
const String testDocumentId = 'document-0001';
const String testVersionId = 'version-0001';

/// A platform context in the fully resolved state, with no service available.
PlatformContext platformContext({
  TenantContext? tenant,
  JurisdictionStatus jurisdiction = const JurisdictionStatus(
    state: PlatformJurisdictionState.verified,
    jurisdictionId: 'jurisdiction-a',
  ),
  OperatingEntityContext operatingEntity = const OperatingEntityAssigned(
    OperatingEntityDetails(
      id: testEntityId,
      name: 'Example Operating Entity',
      jurisdictionRef: 'jurisdiction-a',
      contactReference: 'privacy@example.invalid',
    ),
  ),
  PolicyPackStatus policyPack = const PolicyPackStatus(version: '1.0.0', status: 'ACTIVE'),
  CapabilityNavigation navigation = const CapabilityNavigationResolved(
    <CapabilityDestination>[],
  ),
}) =>
    PlatformContext(
      userId: testUserId,
      sessionId: testSessionId,
      emailVerified: true,
      tenant: tenant ??
          const TenantContextBound(
            TenantMembershipOption(
              tenantId: testTenantId,
              name: 'Example Organisation',
              roleHint: 'MEMBER',
            ),
          ),
      jurisdiction: jurisdiction,
      operatingEntity: operatingEntity,
      policyPack: policyPack,
      navigation: navigation,
    );

/// Two memberships, exactly as the platform would list them.
const List<TenantChoice> twoTenantChoices = <TenantChoice>[
  TenantChoice(tenantId: 'tenant-0001', name: 'First Organisation', roleHint: 'MEMBER'),
  TenantChoice(tenantId: 'tenant-0002', name: 'Second Organisation', roleHint: 'OWNER'),
];

/// One legal document.
///
/// [published] false models a document the platform lists but has published no
/// version of, which is a distinct state from "no document applies".
LegalDocument legalDocument({
  LegalDocumentVersion? effectiveVersion,
  List<String>? purposeRefs,
  String kind = 'LOCAL_SEED_SYNTHETIC_NOTICE',
  bool published = true,
}) =>
    LegalDocument(
      documentId: testDocumentId,
      kind: kind,
      entityId: testEntityId,
      jurisdictionRef: 'jurisdiction-a',
      purposeRefs: purposeRefs ?? const <String>[testPurposeRef],
      effectiveVersion: published
          ? (effectiveVersion ??
              LegalDocumentVersion(
                versionId: testVersionId,
                version: '1.0.0',
                action: LegalDocumentAction.reacceptanceRequired,
                effectiveAt: DateTime.utc(2026, 1, 1),
              ))
          : null,
    );

/// A consent status record in the state the caller asks for.
ConsentStatusRecord consentStatus({
  ConsentStatusState state = ConsentStatusState.noGrant,
  bool noticeRequired = false,
  String? grantId,
  String? grantedVersion,
  String? documentId = testDocumentId,
  String? effectiveVersionId = testVersionId,
}) =>
    ConsentStatusRecord(
      purposeRef: testPurposeRef,
      state: state,
      noticeRequired: noticeRequired,
      operatingEntityId: testEntityId,
      documentId: documentId,
      effectiveVersion: '1.0.0',
      effectiveVersionId: effectiveVersionId,
      grantId: grantId,
      grantedVersion: grantedVersion,
      jurisdictionRef: 'jurisdiction-a',
    );

/// Every prerequisite satisfied.
const ConsentPrerequisites metPrerequisites = ConsentPrerequisites(
  jurisdictionAssigned: true,
  policyPackApproved: true,
  operatingEntityAssigned: true,
);

/// A profile in the active state.
UserProfile userProfile({
  AccountStatus status = AccountStatus.active,
  String displayName = 'Example Person',
}) =>
    UserProfile(
      userId: testUserId,
      tenantId: testTenantId,
      displayName: displayName,
      locale: 'en',
      status: status,
      residencyJurisdictionRef: 'jurisdiction-a',
      createdAt: DateTime.utc(2026, 1, 1),
      updatedAt: DateTime.utc(2026, 2, 1),
    );
