// GENERATED CODE — DO NOT MODIFY BY HAND.
//
// Data-transfer objects for the Karar API.
//
// Source:     packages/api-contracts/openapi/openapi.yaml
// Contract:   Karar API 0.5.0
// Digest:     a3e666d2
// Generator:  tool/generate_api_client.dart 1.0.0
//
// Regenerate:  dart run tool/generate_api_client.dart
// Drift check: dart run tool/generate_api_client.dart --check

// These DTOs belong to the DATA layer. A feature's domain layer must never
// import this file: map a DTO to a domain entity in the repository
// implementation and return the entity.
//
// `toString` prints the type name only. A DTO routinely carries an e-mail
// address, a display name or an identifier, and none of that may reach a log
// through an interpolated string.

import 'package:meta/meta.dart';

/// Discriminated union keyed on `kind`.
@immutable
sealed class BindingStateDto {
  const BindingStateDto();

  /// Decodes the branch named by `kind`.
  ///
  /// An unrecognised discriminator throws [FormatException]: a union the
  /// client cannot classify must not be guessed at, and the transport turns
  /// the throw into a typed contract-violation failure.
  factory BindingStateDto.fromJson(Map<String, Object?> json) {
    final discriminator = json['kind'];
    return switch (discriminator) {
      'BOUND' => BindingStateBoundDto.fromJson(json),
      'TENANT_SELECTION_REQUIRED' => BindingStateTenantSelectionRequiredDto.fromJson(json),
      'UNBOUND' => BindingStateUnboundDto.fromJson(json),
      _ => throw FormatException(
          'Unknown kind for BindingStateDto.',
        ),
    };
  }

  /// The raw discriminator value for this branch.
  String get kind;

  /// Encodes this branch, including its discriminator.
  Map<String, Object?> toJson();
}

/// The `BOUND` branch of [BindingStateDto].
@immutable
final class BindingStateBoundDto extends BindingStateDto {
  const BindingStateBoundDto({
    required this.tenant,
  });

  /// Decodes this branch.
  factory BindingStateBoundDto.fromJson(Map<String, Object?> json) =>
      BindingStateBoundDto(
        tenant: TenantChoiceDto.fromJson(json['tenant']! as Map<String, Object?>),
      );

  final TenantChoiceDto tenant;

  @override
  String get kind => 'BOUND';

  @override
  Map<String, Object?> toJson() => <String, Object?>{
        'kind': 'BOUND',
        'tenant': tenant.toJson(),
      };

  @override
  String toString() => 'BindingStateBoundDto()';
}

/// The `TENANT_SELECTION_REQUIRED` branch of [BindingStateDto].
@immutable
final class BindingStateTenantSelectionRequiredDto extends BindingStateDto {
  const BindingStateTenantSelectionRequiredDto({
    required this.choices,
  });

  /// Decodes this branch.
  factory BindingStateTenantSelectionRequiredDto.fromJson(Map<String, Object?> json) =>
      BindingStateTenantSelectionRequiredDto(
        choices: (json['choices']! as List<Object?>)
            .map((Object? element) => TenantChoiceDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
      );

  final List<TenantChoiceDto> choices;

  @override
  String get kind => 'TENANT_SELECTION_REQUIRED';

  @override
  Map<String, Object?> toJson() => <String, Object?>{
        'kind': 'TENANT_SELECTION_REQUIRED',
        'choices': choices
            .map((TenantChoiceDto element) => element.toJson())
            .toList(growable: false),
      };

  @override
  String toString() => 'BindingStateTenantSelectionRequiredDto()';
}

/// The `UNBOUND` branch of [BindingStateDto].
@immutable
final class BindingStateUnboundDto extends BindingStateDto {
  const BindingStateUnboundDto();

  /// Decodes this branch.
  factory BindingStateUnboundDto.fromJson(Map<String, Object?> json) =>
      const BindingStateUnboundDto();

  @override
  String get kind => 'UNBOUND';

  @override
  Map<String, Object?> toJson() => <String, Object?>{
        'kind': 'UNBOUND',
      };

  @override
  String toString() => 'BindingStateUnboundDto()';
}

/// Contract object.
@immutable
final class BootstrapContextDto {
  const BootstrapContextDto({
    required this.binding,
    required this.capabilities,
    required this.jurisdiction,
    required this.operatingEntity,
    this.policyPack,
    required this.session,
    required this.user,
  });

  /// Decodes the contract representation.
  factory BootstrapContextDto.fromJson(Map<String, Object?> json) => BootstrapContextDto(
        binding: BindingStateDto.fromJson(json['binding']! as Map<String, Object?>),
        capabilities: CapabilitiesSectionDto.fromJson(json['capabilities']! as Map<String, Object?>),
        jurisdiction: BootstrapContextJurisdictionDto.fromJson(json['jurisdiction']! as Map<String, Object?>),
        operatingEntity: OperatingEntityStateDto.fromJson(json['operatingEntity']! as Map<String, Object?>),
        policyPack: json['policyPack'] == null ? null : BootstrapContextPolicyPackDto.fromJson(json['policyPack']! as Map<String, Object?>),
        session: BootstrapContextSessionDto.fromJson(json['session']! as Map<String, Object?>),
        user: BootstrapContextUserDto.fromJson(json['user']! as Map<String, Object?>),
      );

  final BindingStateDto binding;

  final CapabilitiesSectionDto capabilities;

  final BootstrapContextJurisdictionDto jurisdiction;

  final OperatingEntityStateDto operatingEntity;

  /// Version and status only — never pack content. Null means no pack is active for the resolved jurisdiction; a ledger that could not be read answers 503 instead, never null.
  final BootstrapContextPolicyPackDto? policyPack;

  final BootstrapContextSessionDto session;

  final BootstrapContextUserDto user;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'binding': binding.toJson(),
        'capabilities': capabilities.toJson(),
        'jurisdiction': jurisdiction.toJson(),
        'operatingEntity': operatingEntity.toJson(),
        'policyPack': policyPack?.toJson(),
        'session': session.toJson(),
        'user': user.toJson(),
      };

  @override
  String toString() => 'BootstrapContextDto()';
}

/// Contract object.
@immutable
final class BootstrapContextJurisdictionDto {
  const BootstrapContextJurisdictionDto({
    this.jurisdictionId,
    required this.state,
  });

  /// Decodes the contract representation.
  factory BootstrapContextJurisdictionDto.fromJson(Map<String, Object?> json) => BootstrapContextJurisdictionDto(
        jurisdictionId: json['jurisdictionId'] as String?,
        state: BootstrapContextJurisdictionStateDto.fromWire(json['state']! as String),
      );

  /// The assigned jurisdiction as DATA (display, pack selection); null when the state is NONE.
  final String? jurisdictionId;

  /// The typed, fail-closed effective-jurisdiction state. Clients key on THIS, never on the identifier — behaviour differences resolve through policy packs, not through country branches. NONE is the unresolved case (no assignment).
  final BootstrapContextJurisdictionStateDto state;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'jurisdictionId': jurisdictionId,
        'state': state.toWire(),
      };

  @override
  String toString() => 'BootstrapContextJurisdictionDto()';
}

/// The typed, fail-closed effective-jurisdiction state. Clients key on THIS, never on the identifier — behaviour differences resolve through policy packs, not through country branches. NONE is the unresolved case (no assignment).
enum BootstrapContextJurisdictionStateDto {
  none('NONE'),
  unverified('UNVERIFIED'),
  verified('VERIFIED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const BootstrapContextJurisdictionStateDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static BootstrapContextJurisdictionStateDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class BootstrapContextPolicyPackDto {
  const BootstrapContextPolicyPackDto({
    required this.status,
    required this.version,
  });

  /// Decodes the contract representation.
  factory BootstrapContextPolicyPackDto.fromJson(Map<String, Object?> json) => BootstrapContextPolicyPackDto(
        status: json['status']! as String,
        version: json['version']! as String,
      );

  final String status;

  final String version;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'status': status,
        'version': version,
      };

  @override
  String toString() => 'BootstrapContextPolicyPackDto()';
}

/// Contract object.
@immutable
final class BootstrapContextSessionDto {
  const BootstrapContextSessionDto({
    required this.sessionId,
  });

  /// Decodes the contract representation.
  factory BootstrapContextSessionDto.fromJson(Map<String, Object?> json) => BootstrapContextSessionDto(
        sessionId: json['sessionId']! as String,
      );

  final String sessionId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'sessionId': sessionId,
      };

  @override
  String toString() => 'BootstrapContextSessionDto()';
}

/// Contract object.
@immutable
final class BootstrapContextUserDto {
  const BootstrapContextUserDto({
    required this.emailVerified,
    required this.userId,
  });

  /// Decodes the contract representation.
  factory BootstrapContextUserDto.fromJson(Map<String, Object?> json) => BootstrapContextUserDto(
        emailVerified: json['emailVerified']! as bool,
        userId: json['userId']! as String,
      );

  final bool emailVerified;

  final String userId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'emailVerified': emailVerified,
        'userId': userId,
      };

  @override
  String toString() => 'BootstrapContextUserDto()';
}

/// The resolution STATE and the list, structurally inseparable. A 200 always carries state RESOLVED, so an EMPTY `items` is a stated answer rather than something the client must infer; a resolution that failed answers 503 and never reaches this shape.
@immutable
final class CapabilitiesSectionDto {
  const CapabilitiesSectionDto({
    required this.items,
    required this.state,
  });

  /// Decodes the contract representation.
  factory CapabilitiesSectionDto.fromJson(Map<String, Object?> json) => CapabilitiesSectionDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => CapabilityViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        state: CapabilitiesSectionStateDto.fromWire(json['state']! as String),
      );

  /// CLIENT-SAFE capability views, passed through from the client-safe resolver unenriched. Hidden capabilities never appear, in any state; requirements are actionable only.
  final List<CapabilityViewDto> items;

  final CapabilitiesSectionStateDto state;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((CapabilityViewDto element) => element.toJson())
            .toList(growable: false),
        'state': state.toWire(),
      };

  @override
  String toString() => 'CapabilitiesSectionDto()';
}

/// Contract enumeration.
enum CapabilitiesSectionStateDto {
  resolved('RESOLVED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const CapabilitiesSectionStateDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static CapabilitiesSectionStateDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class CapabilityViewDto {
  const CapabilityViewDto({
    required this.id,
    required this.requirements,
    required this.status,
  });

  /// Decodes the contract representation.
  factory CapabilityViewDto.fromJson(Map<String, Object?> json) => CapabilityViewDto(
        id: json['id']! as String,
        requirements: (json['requirements']! as List<Object?>)
            .map((Object? element) => CapabilityViewRequirementsItemDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        status: json['status']! as String,
      );

  final String id;

  final List<CapabilityViewRequirementsItemDto> requirements;

  final String status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'requirements': requirements
            .map((CapabilityViewRequirementsItemDto element) => element.toJson())
            .toList(growable: false),
        'status': status,
      };

  @override
  String toString() => 'CapabilityViewDto()';
}

/// Contract object.
@immutable
final class CapabilityViewRequirementsItemDto {
  const CapabilityViewRequirementsItemDto({
    this.detail,
    required this.kind,
  });

  /// Decodes the contract representation.
  factory CapabilityViewRequirementsItemDto.fromJson(Map<String, Object?> json) => CapabilityViewRequirementsItemDto(
        detail: json['detail'] as String?,
        kind: json['kind']! as String,
      );

  final String? detail;

  final String kind;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'detail': detail,
        'kind': kind,
      };

  @override
  String toString() => 'CapabilityViewRequirementsItemDto()';
}

/// Contract object.
@immutable
final class CreateTenantInvitationRequestDto {
  const CreateTenantInvitationRequestDto({
    required this.email,
    this.expiresInHours,
    this.roleHint,
  });

  /// Decodes the contract representation.
  factory CreateTenantInvitationRequestDto.fromJson(Map<String, Object?> json) => CreateTenantInvitationRequestDto(
        email: json['email']! as String,
        expiresInHours: json['expiresInHours'] as int?,
        roleHint: json['roleHint'] as String?,
      );

  /// Normalized (trim + lowercase) before storage and matching.
  final String email;

  final int? expiresInHours;

  /// Informational only — authoritative roles live in the authorization module.
  final String? roleHint;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'email': email,
        'expiresInHours': expiresInHours,
        'roleHint': roleHint,
      };

  @override
  String toString() => 'CreateTenantInvitationRequestDto()';
}

/// Contract object.
@immutable
final class CreateTenantInvitationResponseDto {
  const CreateTenantInvitationResponseDto({
    required this.invitation,
    required this.token,
  });

  /// Decodes the contract representation.
  factory CreateTenantInvitationResponseDto.fromJson(Map<String, Object?> json) => CreateTenantInvitationResponseDto(
        invitation: InvitationDto.fromJson(json['invitation']! as Map<String, Object?>),
        token: json['token']! as String,
      );

  final InvitationDto invitation;

  /// Shown once; never retrievable again.
  final String token;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'invitation': invitation.toJson(),
        'token': token,
      };

  @override
  String toString() => 'CreateTenantInvitationResponseDto()';
}

/// Contract object.
@immutable
final class DeclarableJurisdictionReferenceDto {
  const DeclarableJurisdictionReferenceDto({
    required this.approvalRecorded,
    required this.code,
    required this.countryCode,
    required this.countryDisplayNameKey,
    required this.jurisdictionId,
    required this.type,
  });

  /// Decodes the contract representation.
  factory DeclarableJurisdictionReferenceDto.fromJson(Map<String, Object?> json) => DeclarableJurisdictionReferenceDto(
        approvalRecorded: json['approvalRecorded']! as bool,
        code: json['code']! as String,
        countryCode: json['countryCode']! as String,
        countryDisplayNameKey: json['countryDisplayNameKey']! as String,
        jurisdictionId: json['jurisdictionId']! as String,
        type: DeclarableJurisdictionReferenceTypeDto.fromWire(json['type']! as String),
      );

  /// Whether the platform's register records a COMPLETED legal approval for this entry. False for every entry today. A selectable jurisdiction is a declarable one; it is not an approved one, and a declaration into it stays UNVERIFIED.
  final bool approvalRecorded;

  /// The register's own reference token — the same value, mirroring the row.
  final String code;

  /// ISO 3166-1 alpha-2. A jurisdiction is NOT a country: one country may carry several regimes (a national one and a financial free zone).
  final String countryCode;

  /// Localisation key for the entry's country, from the country register. Display names live in locale bundles, never in the register, and a jurisdiction entry carries no name of its own — so none is invented here. A client composes its label from this key, the type, and the code.
  final String countryDisplayNameKey;

  /// The identifier to post back to /jurisdiction/self-declaration. Reference DATA: clients never branch on it — behaviour differences resolve through policy packs (architecture test 12).
  final String jurisdictionId;

  /// Structural kind of the regime — what distinguishes AE from AE-DIFC.
  final DeclarableJurisdictionReferenceTypeDto type;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'approvalRecorded': approvalRecorded,
        'code': code,
        'countryCode': countryCode,
        'countryDisplayNameKey': countryDisplayNameKey,
        'jurisdictionId': jurisdictionId,
        'type': type.toWire(),
      };

  @override
  String toString() => 'DeclarableJurisdictionReferenceDto()';
}

/// Structural kind of the regime — what distinguishes AE from AE-DIFC.
enum DeclarableJurisdictionReferenceTypeDto {
  financialFreeZone('FINANCIAL_FREE_ZONE'),
  national('NATIONAL'),
  specialRegime('SPECIAL_REGIME'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const DeclarableJurisdictionReferenceTypeDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static DeclarableJurisdictionReferenceTypeDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class DeclareOwnJurisdictionRequestDto {
  const DeclareOwnJurisdictionRequestDto({
    required this.jurisdictionId,
  });

  /// Decodes the contract representation.
  factory DeclareOwnJurisdictionRequestDto.fromJson(Map<String, Object?> json) => DeclareOwnJurisdictionRequestDto(
        jurisdictionId: json['jurisdictionId']! as String,
      );

  /// A jurisdiction reference code from the platform register, verified server-side. An identifier the register does not hold is refused (400) rather than stored as free text.
  final String jurisdictionId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'jurisdictionId': jurisdictionId,
      };

  @override
  String toString() => 'DeclareOwnJurisdictionRequestDto()';
}

/// Contract object.
@immutable
final class DeclaredJurisdictionDto {
  const DeclaredJurisdictionDto({
    required this.effectiveFrom,
    required this.jurisdictionId,
    required this.recorded,
    required this.source,
    required this.state,
  });

  /// Decodes the contract representation.
  factory DeclaredJurisdictionDto.fromJson(Map<String, Object?> json) => DeclaredJurisdictionDto(
        effectiveFrom: DateTime.parse(json['effectiveFrom']! as String).toUtc(),
        jurisdictionId: json['jurisdictionId']! as String,
        recorded: json['recorded']! as bool,
        source: DeclaredJurisdictionSourceDto.fromWire(json['source']! as String),
        state: DeclaredJurisdictionStateDto.fromWire(json['state']! as String),
      );

  final DateTime effectiveFrom;

  /// The declared jurisdiction as DATA (display, pack selection). Clients never branch on it — behaviour differences resolve through policy packs (architecture test 12).
  final String jurisdictionId;

  /// False when the caller re-declared the jurisdiction already in effect; the standing assignment is returned and no new history window opens.
  final bool recorded;

  final DeclaredJurisdictionSourceDto source;

  /// Always UNVERIFIED. Stated as a field rather than left to documentation, so a client cannot read a successful declaration as verification.
  final DeclaredJurisdictionStateDto state;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'effectiveFrom': effectiveFrom.toUtc().toIso8601String(),
        'jurisdictionId': jurisdictionId,
        'recorded': recorded,
        'source': source.toWire(),
        'state': state.toWire(),
      };

  @override
  String toString() => 'DeclaredJurisdictionDto()';
}

/// Contract enumeration.
enum DeclaredJurisdictionSourceDto {
  userDeclared('USER_DECLARED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const DeclaredJurisdictionSourceDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static DeclaredJurisdictionSourceDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Always UNVERIFIED. Stated as a field rather than left to documentation, so a client cannot read a successful declaration as verification.
enum DeclaredJurisdictionStateDto {
  unverified('UNVERIFIED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const DeclaredJurisdictionStateDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static DeclaredJurisdictionStateDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class GetOwnTenantResponseDto {
  const GetOwnTenantResponseDto({
    required this.membership,
    required this.tenant,
  });

  /// Decodes the contract representation.
  factory GetOwnTenantResponseDto.fromJson(Map<String, Object?> json) => GetOwnTenantResponseDto(
        membership: MembershipDto.fromJson(json['membership']! as Map<String, Object?>),
        tenant: TenantDto.fromJson(json['tenant']! as Map<String, Object?>),
      );

  final MembershipDto membership;

  final TenantDto tenant;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'membership': membership.toJson(),
        'tenant': tenant.toJson(),
      };

  @override
  String toString() => 'GetOwnTenantResponseDto()';
}

/// Contract object.
@immutable
final class IdentityChangePasswordRequestDto {
  const IdentityChangePasswordRequestDto({
    required this.currentPassword,
    required this.newPassword,
  });

  /// Decodes the contract representation.
  factory IdentityChangePasswordRequestDto.fromJson(Map<String, Object?> json) => IdentityChangePasswordRequestDto(
        currentPassword: json['currentPassword']! as String,
        newPassword: json['newPassword']! as String,
      );

  final String currentPassword;

  final String newPassword;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      };

  @override
  String toString() => 'IdentityChangePasswordRequestDto()';
}

/// Contract object.
@immutable
final class IdentityForgotPasswordRequestDto {
  const IdentityForgotPasswordRequestDto({
    required this.email,
  });

  /// Decodes the contract representation.
  factory IdentityForgotPasswordRequestDto.fromJson(Map<String, Object?> json) => IdentityForgotPasswordRequestDto(
        email: json['email']! as String,
      );

  final String email;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'email': email,
      };

  @override
  String toString() => 'IdentityForgotPasswordRequestDto()';
}

/// Contract object.
@immutable
final class IdentityLoginRequestDto {
  const IdentityLoginRequestDto({
    required this.email,
    required this.password,
  });

  /// Decodes the contract representation.
  factory IdentityLoginRequestDto.fromJson(Map<String, Object?> json) => IdentityLoginRequestDto(
        email: json['email']! as String,
        password: json['password']! as String,
      );

  final String email;

  final String password;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'email': email,
        'password': password,
      };

  @override
  String toString() => 'IdentityLoginRequestDto()';
}

/// Contract object.
@immutable
final class IdentityMfaChallengeRequestDto {
  const IdentityMfaChallengeRequestDto({
    required this.challengeToken,
    required this.code,
  });

  /// Decodes the contract representation.
  factory IdentityMfaChallengeRequestDto.fromJson(Map<String, Object?> json) => IdentityMfaChallengeRequestDto(
        challengeToken: json['challengeToken']! as String,
        code: json['code']! as String,
      );

  final String challengeToken;

  final String code;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'challengeToken': challengeToken,
        'code': code,
      };

  @override
  String toString() => 'IdentityMfaChallengeRequestDto()';
}

/// Contract object.
@immutable
final class IdentityMfaConfirmRequestDto {
  const IdentityMfaConfirmRequestDto({
    required this.code,
  });

  /// Decodes the contract representation.
  factory IdentityMfaConfirmRequestDto.fromJson(Map<String, Object?> json) => IdentityMfaConfirmRequestDto(
        code: json['code']! as String,
      );

  /// current 6-digit TOTP code
  final String code;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'code': code,
      };

  @override
  String toString() => 'IdentityMfaConfirmRequestDto()';
}

/// Contract object.
@immutable
final class IdentityMfaDisableRequestDto {
  const IdentityMfaDisableRequestDto({
    required this.code,
  });

  /// Decodes the contract representation.
  factory IdentityMfaDisableRequestDto.fromJson(Map<String, Object?> json) => IdentityMfaDisableRequestDto(
        code: json['code']! as String,
      );

  /// TOTP code or an unused recovery code
  final String code;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'code': code,
      };

  @override
  String toString() => 'IdentityMfaDisableRequestDto()';
}

/// Contract object.
@immutable
final class IdentityMfaRecoveryRequestDto {
  const IdentityMfaRecoveryRequestDto({
    required this.challengeToken,
    required this.recoveryCode,
  });

  /// Decodes the contract representation.
  factory IdentityMfaRecoveryRequestDto.fromJson(Map<String, Object?> json) => IdentityMfaRecoveryRequestDto(
        challengeToken: json['challengeToken']! as String,
        recoveryCode: json['recoveryCode']! as String,
      );

  final String challengeToken;

  final String recoveryCode;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'challengeToken': challengeToken,
        'recoveryCode': recoveryCode,
      };

  @override
  String toString() => 'IdentityMfaRecoveryRequestDto()';
}

/// Contract object.
@immutable
final class IdentityRefreshRequestDto {
  const IdentityRefreshRequestDto({
    required this.refreshToken,
  });

  /// Decodes the contract representation.
  factory IdentityRefreshRequestDto.fromJson(Map<String, Object?> json) => IdentityRefreshRequestDto(
        refreshToken: json['refreshToken']! as String,
      );

  final String refreshToken;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'refreshToken': refreshToken,
      };

  @override
  String toString() => 'IdentityRefreshRequestDto()';
}

/// Contract object.
@immutable
final class IdentityRegisterRequestDto {
  const IdentityRegisterRequestDto({
    required this.email,
    required this.password,
  });

  /// Decodes the contract representation.
  factory IdentityRegisterRequestDto.fromJson(Map<String, Object?> json) => IdentityRegisterRequestDto(
        email: json['email']! as String,
        password: json['password']! as String,
      );

  final String email;

  final String password;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'email': email,
        'password': password,
      };

  @override
  String toString() => 'IdentityRegisterRequestDto()';
}

/// Contract object.
@immutable
final class IdentityResendVerificationRequestDto {
  const IdentityResendVerificationRequestDto({
    required this.email,
  });

  /// Decodes the contract representation.
  factory IdentityResendVerificationRequestDto.fromJson(Map<String, Object?> json) => IdentityResendVerificationRequestDto(
        email: json['email']! as String,
      );

  final String email;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'email': email,
      };

  @override
  String toString() => 'IdentityResendVerificationRequestDto()';
}

/// Contract object.
@immutable
final class IdentityResetPasswordRequestDto {
  const IdentityResetPasswordRequestDto({
    required this.newPassword,
    required this.token,
  });

  /// Decodes the contract representation.
  factory IdentityResetPasswordRequestDto.fromJson(Map<String, Object?> json) => IdentityResetPasswordRequestDto(
        newPassword: json['newPassword']! as String,
        token: json['token']! as String,
      );

  final String newPassword;

  final String token;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'newPassword': newPassword,
        'token': token,
      };

  @override
  String toString() => 'IdentityResetPasswordRequestDto()';
}

/// Contract object.
@immutable
final class IdentityVerifyEmailRequestDto {
  const IdentityVerifyEmailRequestDto({
    required this.code,
    required this.email,
  });

  /// Decodes the contract representation.
  factory IdentityVerifyEmailRequestDto.fromJson(Map<String, Object?> json) => IdentityVerifyEmailRequestDto(
        code: json['code']! as String,
        email: json['email']! as String,
      );

  /// 8-character code from the e-mail
  final String code;

  final String email;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'code': code,
        'email': email,
      };

  @override
  String toString() => 'IdentityVerifyEmailRequestDto()';
}

/// Contract object.
@immutable
final class InvitationDto {
  const InvitationDto({
    required this.createdAt,
    required this.email,
    required this.expiresAt,
    required this.id,
    this.redeemedAt,
    this.revokedAt,
    required this.roleHint,
    required this.tenantId,
  });

  /// Decodes the contract representation.
  factory InvitationDto.fromJson(Map<String, Object?> json) => InvitationDto(
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        email: json['email']! as String,
        expiresAt: DateTime.parse(json['expiresAt']! as String).toUtc(),
        id: json['id']! as String,
        redeemedAt: json['redeemedAt'] == null ? null : DateTime.parse(json['redeemedAt']! as String).toUtc(),
        revokedAt: json['revokedAt'] == null ? null : DateTime.parse(json['revokedAt']! as String).toUtc(),
        roleHint: json['roleHint']! as String,
        tenantId: json['tenantId']! as String,
      );

  final DateTime createdAt;

  /// Normalized invitee email. The token hash is never exposed.
  final String email;

  final DateTime expiresAt;

  final String id;

  final DateTime? redeemedAt;

  final DateTime? revokedAt;

  final String roleHint;

  final String tenantId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'createdAt': createdAt.toUtc().toIso8601String(),
        'email': email,
        'expiresAt': expiresAt.toUtc().toIso8601String(),
        'id': id,
        'redeemedAt': redeemedAt?.toUtc().toIso8601String(),
        'revokedAt': revokedAt?.toUtc().toIso8601String(),
        'roleHint': roleHint,
        'tenantId': tenantId,
      };

  @override
  String toString() => 'InvitationDto()';
}

/// Contract object.
@immutable
final class ListApplicableConsentDocumentsResponseDocumentsItemDto {
  const ListApplicableConsentDocumentsResponseDocumentsItemDto({
    required this.documentId,
    this.effectiveVersion,
    required this.entityId,
    required this.jurisdictionRef,
    required this.kind,
    required this.purposeRefs,
  });

  /// Decodes the contract representation.
  factory ListApplicableConsentDocumentsResponseDocumentsItemDto.fromJson(Map<String, Object?> json) => ListApplicableConsentDocumentsResponseDocumentsItemDto(
        documentId: json['documentId']! as String,
        effectiveVersion: json['effectiveVersion'] == null ? null : ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionDto.fromJson(json['effectiveVersion']! as Map<String, Object?>),
        entityId: json['entityId']! as String,
        jurisdictionRef: json['jurisdictionRef']! as String,
        kind: json['kind']! as String,
        purposeRefs: (json['purposeRefs']! as List<Object?>)
            .map((Object? element) => element! as String)
            .toList(growable: false),
      );

  final String documentId;

  final ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionDto? effectiveVersion;

  final String entityId;

  final String jurisdictionRef;

  final String kind;

  final List<String> purposeRefs;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'documentId': documentId,
        'effectiveVersion': effectiveVersion?.toJson(),
        'entityId': entityId,
        'jurisdictionRef': jurisdictionRef,
        'kind': kind,
        'purposeRefs': purposeRefs
            .map((String element) => element)
            .toList(growable: false),
      };

  @override
  String toString() => 'ListApplicableConsentDocumentsResponseDocumentsItemDto()';
}

/// Contract enumeration.
enum ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionClassificationDto {
  materialReacceptanceRequired('MATERIAL_REACCEPTANCE_REQUIRED'),
  noticeRequired('NOTICE_REQUIRED'),
  noUserActionRequired('NO_USER_ACTION_REQUIRED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionClassificationDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionClassificationDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionDto {
  const ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionDto({
    this.classification,
    required this.contentHash,
    this.effectiveAt,
    required this.version,
    required this.versionId,
  });

  /// Decodes the contract representation.
  factory ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionDto.fromJson(Map<String, Object?> json) => ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionDto(
        classification: json['classification'] == null ? null : ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionClassificationDto.fromWire(json['classification']! as String),
        contentHash: json['contentHash']! as String,
        effectiveAt: json['effectiveAt'] == null ? null : DateTime.parse(json['effectiveAt']! as String).toUtc(),
        version: json['version']! as String,
        versionId: json['versionId']! as String,
      );

  final ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionClassificationDto? classification;

  /// sha256 of the canonical document bytes. The content route serves only bytes that match it, so a client may re-check what it displayed against what it later accepts.
  final String contentHash;

  final DateTime? effectiveAt;

  final String version;

  final String versionId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'classification': classification?.toWire(),
        'contentHash': contentHash,
        'effectiveAt': effectiveAt?.toUtc().toIso8601String(),
        'version': version,
        'versionId': versionId,
      };

  @override
  String toString() => 'ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionDto()';
}

/// Contract object.
@immutable
final class ListApplicableConsentDocumentsResponseDto {
  const ListApplicableConsentDocumentsResponseDto({
    required this.documents,
  });

  /// Decodes the contract representation.
  factory ListApplicableConsentDocumentsResponseDto.fromJson(Map<String, Object?> json) => ListApplicableConsentDocumentsResponseDto(
        documents: (json['documents']! as List<Object?>)
            .map((Object? element) => ListApplicableConsentDocumentsResponseDocumentsItemDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
      );

  final List<ListApplicableConsentDocumentsResponseDocumentsItemDto> documents;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'documents': documents
            .map((ListApplicableConsentDocumentsResponseDocumentsItemDto element) => element.toJson())
            .toList(growable: false),
      };

  @override
  String toString() => 'ListApplicableConsentDocumentsResponseDto()';
}

/// Contract object.
@immutable
final class ListDeclarableJurisdictionReferencesResponseDto {
  const ListDeclarableJurisdictionReferencesResponseDto({
    required this.references,
  });

  /// Decodes the contract representation.
  factory ListDeclarableJurisdictionReferencesResponseDto.fromJson(Map<String, Object?> json) => ListDeclarableJurisdictionReferencesResponseDto(
        references: (json['references']! as List<Object?>)
            .map((Object? element) => DeclarableJurisdictionReferenceDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
      );

  final List<DeclarableJurisdictionReferenceDto> references;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'references': references
            .map((DeclarableJurisdictionReferenceDto element) => element.toJson())
            .toList(growable: false),
      };

  @override
  String toString() => 'ListDeclarableJurisdictionReferencesResponseDto()';
}

/// Contract object.
@immutable
final class ListOwnTenantMembershipsResponseDto {
  const ListOwnTenantMembershipsResponseDto({
    required this.memberships,
  });

  /// Decodes the contract representation.
  factory ListOwnTenantMembershipsResponseDto.fromJson(Map<String, Object?> json) => ListOwnTenantMembershipsResponseDto(
        memberships: (json['memberships']! as List<Object?>)
            .map((Object? element) => MembershipDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
      );

  final List<MembershipDto> memberships;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'memberships': memberships
            .map((MembershipDto element) => element.toJson())
            .toList(growable: false),
      };

  @override
  String toString() => 'ListOwnTenantMembershipsResponseDto()';
}

/// Contract object.
@immutable
final class ListTenantMembersResponseDto {
  const ListTenantMembersResponseDto({
    required this.members,
  });

  /// Decodes the contract representation.
  factory ListTenantMembersResponseDto.fromJson(Map<String, Object?> json) => ListTenantMembersResponseDto(
        members: (json['members']! as List<Object?>)
            .map((Object? element) => MembershipDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
      );

  final List<MembershipDto> members;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'members': members
            .map((MembershipDto element) => element.toJson())
            .toList(growable: false),
      };

  @override
  String toString() => 'ListTenantMembersResponseDto()';
}

/// Contract object.
@immutable
final class MembershipDto {
  const MembershipDto({
    required this.effectiveFrom,
    this.effectiveTo,
    required this.id,
    required this.roleHint,
    required this.state,
    required this.tenantId,
    required this.userId,
  });

  /// Decodes the contract representation.
  factory MembershipDto.fromJson(Map<String, Object?> json) => MembershipDto(
        effectiveFrom: DateTime.parse(json['effectiveFrom']! as String).toUtc(),
        effectiveTo: json['effectiveTo'] == null ? null : DateTime.parse(json['effectiveTo']! as String).toUtc(),
        id: json['id']! as String,
        roleHint: json['roleHint']! as String,
        state: MembershipStateDto.fromWire(json['state']! as String),
        tenantId: json['tenantId']! as String,
        userId: json['userId']! as String,
      );

  final DateTime effectiveFrom;

  final DateTime? effectiveTo;

  final String id;

  /// Informational only — authoritative roles live in the authorization module.
  final String roleHint;

  final MembershipStateDto state;

  final String tenantId;

  /// The identity account id — IS the platform UserId.
  final String userId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'effectiveFrom': effectiveFrom.toUtc().toIso8601String(),
        'effectiveTo': effectiveTo?.toUtc().toIso8601String(),
        'id': id,
        'roleHint': roleHint,
        'state': state.toWire(),
        'tenantId': tenantId,
        'userId': userId,
      };

  @override
  String toString() => 'MembershipDto()';
}

/// Contract enumeration.
enum MembershipStateDto {
  active('ACTIVE'),
  invited('INVITED'),
  removed('REMOVED'),
  suspended('SUSPENDED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const MembershipStateDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static MembershipStateDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Which legal person the caller contracted with, as a STATE plus the reviewed safe projection. ASSIGNED carries the entity; UNASSIGNED means no binding exists; UNAVAILABLE means the read failed and the reference is not known. The entity is never fabricated, and `entity` is explicitly null (not omitted) in both absent states.
@immutable
final class OperatingEntityStateDto {
  const OperatingEntityStateDto({
    this.entity,
    required this.state,
  });

  /// Decodes the contract representation.
  factory OperatingEntityStateDto.fromJson(Map<String, Object?> json) => OperatingEntityStateDto(
        entity: json['entity'] == null ? null : OperatingEntitySummaryDto.fromJson(json['entity']! as Map<String, Object?>),
        state: OperatingEntityStateStateDto.fromWire(json['state']! as String),
      );

  final OperatingEntitySummaryDto? entity;

  final OperatingEntityStateStateDto state;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'entity': entity?.toJson(),
        'state': state.toWire(),
      };

  @override
  String toString() => 'OperatingEntityStateDto()';
}

/// Contract enumeration.
enum OperatingEntityStateStateDto {
  assigned('ASSIGNED'),
  unassigned('UNASSIGNED'),
  unavailable('UNAVAILABLE'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const OperatingEntityStateStateDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static OperatingEntityStateStateDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// The reviewed safe field set. Deliberately absent and never to be added: licence records and evidence references, registration numbers and other register internals, contracting capacity, controller/processor legal analysis, data-protection role assignments, entity status, and administrative timestamps.
@immutable
final class OperatingEntitySummaryDto {
  const OperatingEntitySummaryDto({
    this.contactReference,
    required this.id,
    this.jurisdictionRef,
    required this.name,
  });

  /// Decodes the contract representation.
  factory OperatingEntitySummaryDto.fromJson(Map<String, Object?> json) => OperatingEntitySummaryDto(
        contactReference: json['contactReference'] as String?,
        id: json['id']! as String,
        jurisdictionRef: json['jurisdictionRef'] as String?,
        name: json['name']! as String,
      );

  /// A published role-mailbox reference for data-protection contact, where the register carries one. Never a named person.
  final String? contactReference;

  final String id;

  /// The regime the entity is registered in, as DATA for display. Clients never branch on it (architecture test 12).
  final String? jurisdictionRef;

  /// The registered legal name — the register holds no separate trading name, and none is invented.
  final String name;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'contactReference': contactReference,
        'id': id,
        'jurisdictionRef': jurisdictionRef,
        'name': name,
      };

  @override
  String toString() => 'OperatingEntitySummaryDto()';
}

/// Contract object.
@immutable
final class ReadConsentDocumentContentResponseDto {
  const ReadConsentDocumentContentResponseDto({
    required this.content,
    required this.contentHash,
    required this.documentId,
    this.effectiveAt,
    required this.format,
    required this.language,
    required this.version,
    required this.versionId,
  });

  /// Decodes the contract representation.
  factory ReadConsentDocumentContentResponseDto.fromJson(Map<String, Object?> json) => ReadConsentDocumentContentResponseDto(
        content: json['content']! as String,
        contentHash: json['contentHash']! as String,
        documentId: json['documentId']! as String,
        effectiveAt: json['effectiveAt'] == null ? null : DateTime.parse(json['effectiveAt']! as String).toUtc(),
        format: ReadConsentDocumentContentResponseFormatDto.fromWire(json['format']! as String),
        language: json['language']! as String,
        version: json['version']! as String,
        versionId: json['versionId']! as String,
      );

  /// The document text, server-supplied. No internal storage locator appears anywhere in this response.
  final String content;

  /// sha256 the served bytes were verified against.
  final String contentHash;

  final String documentId;

  final DateTime? effectiveAt;

  final ReadConsentDocumentContentResponseFormatDto format;

  /// BCP-47 tag of the text, as the content source recorded it. Never inferred; content whose language cannot be stated is not served.
  final String language;

  final String version;

  /// The exact version displayed — post this to /consent/acceptances.
  final String versionId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'content': content,
        'contentHash': contentHash,
        'documentId': documentId,
        'effectiveAt': effectiveAt?.toUtc().toIso8601String(),
        'format': format.toWire(),
        'language': language,
        'version': version,
        'versionId': versionId,
      };

  @override
  String toString() => 'ReadConsentDocumentContentResponseDto()';
}

/// Contract enumeration.
enum ReadConsentDocumentContentResponseFormatDto {
  textMarkdown('text/markdown'),
  textPlain('text/plain'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const ReadConsentDocumentContentResponseFormatDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static ReadConsentDocumentContentResponseFormatDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class ReadOwnConsentStatusResponseDto {
  const ReadOwnConsentStatusResponseDto({
    this.documentId,
    this.effectiveVersion,
    this.effectiveVersionId,
    this.grantId,
    this.grantedVersion,
    this.jurisdictionRef,
    required this.noticeRequired,
    required this.operatingEntityId,
    required this.purposeRef,
    required this.state,
  });

  /// Decodes the contract representation.
  factory ReadOwnConsentStatusResponseDto.fromJson(Map<String, Object?> json) => ReadOwnConsentStatusResponseDto(
        documentId: json['documentId'] as String?,
        effectiveVersion: json['effectiveVersion'] as String?,
        effectiveVersionId: json['effectiveVersionId'] as String?,
        grantId: json['grantId'] as String?,
        grantedVersion: json['grantedVersion'] as String?,
        jurisdictionRef: json['jurisdictionRef'] as String?,
        noticeRequired: json['noticeRequired']! as bool,
        operatingEntityId: json['operatingEntityId']! as String,
        purposeRef: json['purposeRef']! as String,
        state: ReadOwnConsentStatusResponseStateDto.fromWire(json['state']! as String),
      );

  final String? documentId;

  final String? effectiveVersion;

  final String? effectiveVersionId;

  final String? grantId;

  final String? grantedVersion;

  final String? jurisdictionRef;

  final bool noticeRequired;

  final String operatingEntityId;

  final String purposeRef;

  final ReadOwnConsentStatusResponseStateDto state;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'documentId': documentId,
        'effectiveVersion': effectiveVersion,
        'effectiveVersionId': effectiveVersionId,
        'grantId': grantId,
        'grantedVersion': grantedVersion,
        'jurisdictionRef': jurisdictionRef,
        'noticeRequired': noticeRequired,
        'operatingEntityId': operatingEntityId,
        'purposeRef': purposeRef,
        'state': state.toWire(),
      };

  @override
  String toString() => 'ReadOwnConsentStatusResponseDto()';
}

/// Contract enumeration.
enum ReadOwnConsentStatusResponseStateDto {
  active('ACTIVE'),
  noGrant('NO_GRANT'),
  reconsentRequired('RECONSENT_REQUIRED'),
  withdrawn('WITHDRAWN'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const ReadOwnConsentStatusResponseStateDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static ReadOwnConsentStatusResponseStateDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class RecordOwnConsentAcceptanceRequestDto {
  const RecordOwnConsentAcceptanceRequestDto({
    required this.legalDocumentVersionId,
    required this.purposeRef,
  });

  /// Decodes the contract representation.
  factory RecordOwnConsentAcceptanceRequestDto.fromJson(Map<String, Object?> json) => RecordOwnConsentAcceptanceRequestDto(
        legalDocumentVersionId: json['legalDocumentVersionId']! as String,
        purposeRef: json['purposeRef']! as String,
      );

  final String legalDocumentVersionId;

  final String purposeRef;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'legalDocumentVersionId': legalDocumentVersionId,
        'purposeRef': purposeRef,
      };

  @override
  String toString() => 'RecordOwnConsentAcceptanceRequestDto()';
}

/// Contract object.
@immutable
final class RecordOwnConsentAcceptanceResponseDto {
  const RecordOwnConsentAcceptanceResponseDto({
    required this.consentVersion,
    required this.grantId,
    required this.grantedAt,
    required this.jurisdictionRef,
    required this.legalDocumentVersionId,
    required this.operatingEntityId,
    required this.purposeRef,
    required this.status,
  });

  /// Decodes the contract representation.
  factory RecordOwnConsentAcceptanceResponseDto.fromJson(Map<String, Object?> json) => RecordOwnConsentAcceptanceResponseDto(
        consentVersion: json['consentVersion']! as String,
        grantId: json['grantId']! as String,
        grantedAt: DateTime.parse(json['grantedAt']! as String).toUtc(),
        jurisdictionRef: json['jurisdictionRef']! as String,
        legalDocumentVersionId: json['legalDocumentVersionId']! as String,
        operatingEntityId: json['operatingEntityId']! as String,
        purposeRef: json['purposeRef']! as String,
        status: RecordOwnConsentAcceptanceResponseStatusDto.fromWire(json['status']! as String),
      );

  final String consentVersion;

  final String grantId;

  final DateTime grantedAt;

  final String jurisdictionRef;

  final String legalDocumentVersionId;

  final String operatingEntityId;

  final String purposeRef;

  final RecordOwnConsentAcceptanceResponseStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'consentVersion': consentVersion,
        'grantId': grantId,
        'grantedAt': grantedAt.toUtc().toIso8601String(),
        'jurisdictionRef': jurisdictionRef,
        'legalDocumentVersionId': legalDocumentVersionId,
        'operatingEntityId': operatingEntityId,
        'purposeRef': purposeRef,
        'status': status.toWire(),
      };

  @override
  String toString() => 'RecordOwnConsentAcceptanceResponseDto()';
}

/// Contract enumeration.
enum RecordOwnConsentAcceptanceResponseStatusDto {
  active('ACTIVE'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const RecordOwnConsentAcceptanceResponseStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static RecordOwnConsentAcceptanceResponseStatusDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class RedeemTenantInvitationRequestDto {
  const RedeemTenantInvitationRequestDto({
    required this.token,
  });

  /// Decodes the contract representation.
  factory RedeemTenantInvitationRequestDto.fromJson(Map<String, Object?> json) => RedeemTenantInvitationRequestDto(
        token: json['token']! as String,
      );

  final String token;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'token': token,
      };

  @override
  String toString() => 'RedeemTenantInvitationRequestDto()';
}

/// Contract object.
@immutable
final class RedeemTenantInvitationResponseDto {
  const RedeemTenantInvitationResponseDto({
    required this.membership,
    required this.tenantId,
  });

  /// Decodes the contract representation.
  factory RedeemTenantInvitationResponseDto.fromJson(Map<String, Object?> json) => RedeemTenantInvitationResponseDto(
        membership: MembershipDto.fromJson(json['membership']! as Map<String, Object?>),
        tenantId: json['tenantId']! as String,
      );

  final MembershipDto membership;

  /// From the invitation record, server-side — never from the request.
  final String tenantId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'membership': membership.toJson(),
        'tenantId': tenantId,
      };

  @override
  String toString() => 'RedeemTenantInvitationResponseDto()';
}

/// Contract object.
@immutable
final class RequestOwnAccountDisableRequestDto {
  const RequestOwnAccountDisableRequestDto({
    this.reason,
  });

  /// Decodes the contract representation.
  factory RequestOwnAccountDisableRequestDto.fromJson(Map<String, Object?> json) => RequestOwnAccountDisableRequestDto(
        reason: json['reason'] as String?,
      );

  final String? reason;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'reason': reason,
      };

  @override
  String toString() => 'RequestOwnAccountDisableRequestDto()';
}

/// Contract object.
@immutable
final class RequestOwnAccountDisableResponseDto {
  const RequestOwnAccountDisableResponseDto({
    required this.auditRecorded,
    required this.requestedAt,
    required this.status,
  });

  /// Decodes the contract representation.
  factory RequestOwnAccountDisableResponseDto.fromJson(Map<String, Object?> json) => RequestOwnAccountDisableResponseDto(
        auditRecorded: json['auditRecorded']! as bool,
        requestedAt: DateTime.parse(json['requestedAt']! as String).toUtc(),
        status: RequestOwnAccountDisableResponseStatusDto.fromWire(json['status']! as String),
      );

  /// False when the state change committed but the audit append failed.
  final bool auditRecorded;

  final DateTime requestedAt;

  final RequestOwnAccountDisableResponseStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'auditRecorded': auditRecorded,
        'requestedAt': requestedAt.toUtc().toIso8601String(),
        'status': status.toWire(),
      };

  @override
  String toString() => 'RequestOwnAccountDisableResponseDto()';
}

/// Contract enumeration.
enum RequestOwnAccountDisableResponseStatusDto {
  disableRequested('DISABLE_REQUESTED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const RequestOwnAccountDisableResponseStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static RequestOwnAccountDisableResponseStatusDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class RevokeTenantInvitationResponseDto {
  const RevokeTenantInvitationResponseDto({
    required this.invitation,
  });

  /// Decodes the contract representation.
  factory RevokeTenantInvitationResponseDto.fromJson(Map<String, Object?> json) => RevokeTenantInvitationResponseDto(
        invitation: InvitationDto.fromJson(json['invitation']! as Map<String, Object?>),
      );

  final InvitationDto invitation;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'invitation': invitation.toJson(),
      };

  @override
  String toString() => 'RevokeTenantInvitationResponseDto()';
}

/// Contract object.
@immutable
final class SetPlatformTenantBindingRequestDto {
  const SetPlatformTenantBindingRequestDto({
    required this.tenantId,
  });

  /// Decodes the contract representation.
  factory SetPlatformTenantBindingRequestDto.fromJson(Map<String, Object?> json) => SetPlatformTenantBindingRequestDto(
        tenantId: json['tenantId']! as String,
      );

  /// The selected tenant — must be one of the caller's own active memberships; verified server-side, never trusted.
  final String tenantId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'tenantId': tenantId,
      };

  @override
  String toString() => 'SetPlatformTenantBindingRequestDto()';
}

/// Discriminated union keyed on `kind`.
@immutable
sealed class SetPlatformTenantBindingResponseDto {
  const SetPlatformTenantBindingResponseDto();

  /// Decodes the branch named by `kind`.
  ///
  /// An unrecognised discriminator throws [FormatException]: a union the
  /// client cannot classify must not be guessed at, and the transport turns
  /// the throw into a typed contract-violation failure.
  factory SetPlatformTenantBindingResponseDto.fromJson(Map<String, Object?> json) {
    final discriminator = json['kind'];
    return switch (discriminator) {
      'BOUND' => SetPlatformTenantBindingResponseBoundDto.fromJson(json),
      'SWITCHED' => SetPlatformTenantBindingResponseSwitchedDto.fromJson(json),
      _ => throw FormatException(
          'Unknown kind for SetPlatformTenantBindingResponseDto.',
        ),
    };
  }

  /// The raw discriminator value for this branch.
  String get kind;

  /// Encodes this branch, including its discriminator.
  Map<String, Object?> toJson();
}

/// The `BOUND` branch of [SetPlatformTenantBindingResponseDto].
@immutable
final class SetPlatformTenantBindingResponseBoundDto extends SetPlatformTenantBindingResponseDto {
  const SetPlatformTenantBindingResponseBoundDto({
    required this.binding,
  });

  /// Decodes this branch.
  factory SetPlatformTenantBindingResponseBoundDto.fromJson(Map<String, Object?> json) =>
      SetPlatformTenantBindingResponseBoundDto(
        binding: BindingStateDto.fromJson(json['binding']! as Map<String, Object?>),
      );

  final BindingStateDto binding;

  @override
  String get kind => 'BOUND';

  @override
  Map<String, Object?> toJson() => <String, Object?>{
        'kind': 'BOUND',
        'binding': binding.toJson(),
      };

  @override
  String toString() => 'SetPlatformTenantBindingResponseBoundDto()';
}

/// The `SWITCHED` branch of [SetPlatformTenantBindingResponseDto].
@immutable
final class SetPlatformTenantBindingResponseSwitchedDto extends SetPlatformTenantBindingResponseDto {
  const SetPlatformTenantBindingResponseSwitchedDto({
    required this.binding,
    required this.tokens,
  });

  /// Decodes this branch.
  factory SetPlatformTenantBindingResponseSwitchedDto.fromJson(Map<String, Object?> json) =>
      SetPlatformTenantBindingResponseSwitchedDto(
        binding: BindingStateDto.fromJson(json['binding']! as Map<String, Object?>),
        tokens: SetPlatformTenantBindingResponseSwitchedTokensDto.fromJson(json['tokens']! as Map<String, Object?>),
      );

  final BindingStateDto binding;

  final SetPlatformTenantBindingResponseSwitchedTokensDto tokens;

  @override
  String get kind => 'SWITCHED';

  @override
  Map<String, Object?> toJson() => <String, Object?>{
        'kind': 'SWITCHED',
        'binding': binding.toJson(),
        'tokens': tokens.toJson(),
      };

  @override
  String toString() => 'SetPlatformTenantBindingResponseSwitchedDto()';
}

/// Contract object.
@immutable
final class SetPlatformTenantBindingResponseSwitchedTokensDto {
  const SetPlatformTenantBindingResponseSwitchedTokensDto({
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
    required this.refreshTokenExpiresAt,
    required this.sessionId,
  });

  /// Decodes the contract representation.
  factory SetPlatformTenantBindingResponseSwitchedTokensDto.fromJson(Map<String, Object?> json) => SetPlatformTenantBindingResponseSwitchedTokensDto(
        accessToken: json['accessToken']! as String,
        accessTokenExpiresAt: DateTime.parse(json['accessTokenExpiresAt']! as String).toUtc(),
        refreshToken: json['refreshToken']! as String,
        refreshTokenExpiresAt: DateTime.parse(json['refreshTokenExpiresAt']! as String).toUtc(),
        sessionId: json['sessionId']! as String,
      );

  final String accessToken;

  final DateTime accessTokenExpiresAt;

  /// The NEW refresh token — every prior token is dead.
  final String refreshToken;

  final DateTime refreshTokenExpiresAt;

  final String sessionId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accessToken': accessToken,
        'accessTokenExpiresAt': accessTokenExpiresAt.toUtc().toIso8601String(),
        'refreshToken': refreshToken,
        'refreshTokenExpiresAt': refreshTokenExpiresAt.toUtc().toIso8601String(),
        'sessionId': sessionId,
      };

  @override
  String toString() => 'SetPlatformTenantBindingResponseSwitchedTokensDto()';
}

/// Contract object.
@immutable
final class TenantChoiceDto {
  const TenantChoiceDto({
    required this.name,
    required this.roleHint,
    required this.tenantId,
  });

  /// Decodes the contract representation.
  factory TenantChoiceDto.fromJson(Map<String, Object?> json) => TenantChoiceDto(
        name: json['name']! as String,
        roleHint: json['roleHint']! as String,
        tenantId: json['tenantId']! as String,
      );

  final String name;

  /// Informational only — authoritative roles live in the authorization module.
  final String roleHint;

  final String tenantId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'name': name,
        'roleHint': roleHint,
        'tenantId': tenantId,
      };

  @override
  String toString() => 'TenantChoiceDto()';
}

/// Contract object.
@immutable
final class TenantDto {
  const TenantDto({
    required this.createdAt,
    required this.id,
    required this.name,
    required this.status,
    required this.type,
  });

  /// Decodes the contract representation.
  factory TenantDto.fromJson(Map<String, Object?> json) => TenantDto(
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        id: json['id']! as String,
        name: json['name']! as String,
        status: TenantStatusDto.fromWire(json['status']! as String),
        type: TenantTypeDto.fromWire(json['type']! as String),
      );

  final DateTime createdAt;

  final String id;

  final String name;

  final TenantStatusDto status;

  final TenantTypeDto type;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'createdAt': createdAt.toUtc().toIso8601String(),
        'id': id,
        'name': name,
        'status': status.toWire(),
        'type': type.toWire(),
      };

  @override
  String toString() => 'TenantDto()';
}

/// Contract enumeration.
enum TenantStatusDto {
  active('ACTIVE'),
  closed('CLOSED'),
  suspended('SUSPENDED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const TenantStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static TenantStatusDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract enumeration.
enum TenantTypeDto {
  firstParty('FIRST_PARTY'),
  internal('INTERNAL'),
  whiteLabel('WHITE_LABEL'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const TenantTypeDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static TenantTypeDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class UpdateOwnUserProfileRequestDto {
  const UpdateOwnUserProfileRequestDto({
    this.displayName,
    this.locale,
  });

  /// Decodes the contract representation.
  factory UpdateOwnUserProfileRequestDto.fromJson(Map<String, Object?> json) => UpdateOwnUserProfileRequestDto(
        displayName: json['displayName'] as String?,
        locale: json['locale'] as String?,
      );

  /// Trimmed before storage; control characters rejected.
  final String? displayName;

  /// BCP-47-shaped tag ('ar', 'ar-QA', 'en-US').
  final String? locale;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'displayName': displayName,
        'locale': locale,
      };

  @override
  String toString() => 'UpdateOwnUserProfileRequestDto()';
}

/// Contract object.
@immutable
final class UserProfileDto {
  const UserProfileDto({
    required this.createdAt,
    required this.displayName,
    required this.locale,
    this.residencyJurisdictionRef,
    required this.status,
    required this.tenantId,
    required this.updatedAt,
    required this.userId,
  });

  /// Decodes the contract representation.
  factory UserProfileDto.fromJson(Map<String, Object?> json) => UserProfileDto(
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        displayName: json['displayName']! as String,
        locale: json['locale']! as String,
        residencyJurisdictionRef: json['residencyJurisdictionRef'] as String?,
        status: UserProfileStatusDto.fromWire(json['status']! as String),
        tenantId: json['tenantId']! as String,
        updatedAt: DateTime.parse(json['updatedAt']! as String).toUtc(),
        userId: json['userId']! as String,
      );

  final DateTime createdAt;

  final String displayName;

  final String locale;

  /// Typed unresolved reference; resolved by Phase 3.5 policy machinery.
  final String? residencyJurisdictionRef;

  final UserProfileStatusDto status;

  final String tenantId;

  final DateTime updatedAt;

  /// The identity account id — IS the platform UserId.
  final String userId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'createdAt': createdAt.toUtc().toIso8601String(),
        'displayName': displayName,
        'locale': locale,
        'residencyJurisdictionRef': residencyJurisdictionRef,
        'status': status.toWire(),
        'tenantId': tenantId,
        'updatedAt': updatedAt.toUtc().toIso8601String(),
        'userId': userId,
      };

  @override
  String toString() => 'UserProfileDto()';
}

/// Contract enumeration.
enum UserProfileStatusDto {
  active('ACTIVE'),
  deletionRequested('DELETION_REQUESTED'),
  disabled('DISABLED'),
  disableRequested('DISABLE_REQUESTED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const UserProfileStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static UserProfileStatusDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}

/// Contract object.
@immutable
final class WithdrawOwnConsentRequestDto {
  const WithdrawOwnConsentRequestDto({
    required this.grantId,
  });

  /// Decodes the contract representation.
  factory WithdrawOwnConsentRequestDto.fromJson(Map<String, Object?> json) => WithdrawOwnConsentRequestDto(
        grantId: json['grantId']! as String,
      );

  final String grantId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'grantId': grantId,
      };

  @override
  String toString() => 'WithdrawOwnConsentRequestDto()';
}

/// Contract object.
@immutable
final class WithdrawOwnConsentResponseDto {
  const WithdrawOwnConsentResponseDto({
    required this.grantId,
    required this.status,
    required this.withdrawnAt,
  });

  /// Decodes the contract representation.
  factory WithdrawOwnConsentResponseDto.fromJson(Map<String, Object?> json) => WithdrawOwnConsentResponseDto(
        grantId: json['grantId']! as String,
        status: WithdrawOwnConsentResponseStatusDto.fromWire(json['status']! as String),
        withdrawnAt: DateTime.parse(json['withdrawnAt']! as String).toUtc(),
      );

  final String grantId;

  final WithdrawOwnConsentResponseStatusDto status;

  final DateTime withdrawnAt;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'grantId': grantId,
        'status': status.toWire(),
        'withdrawnAt': withdrawnAt.toUtc().toIso8601String(),
      };

  @override
  String toString() => 'WithdrawOwnConsentResponseDto()';
}

/// Contract enumeration.
enum WithdrawOwnConsentResponseStatusDto {
  withdrawn('WITHDRAWN'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const WithdrawOwnConsentResponseStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static WithdrawOwnConsentResponseStatusDto fromWire(String? value) {
    for (final candidate in values) {
      if (candidate.wireValue == value) {
        return candidate;
      }
    }
    return unknown;
  }

  /// The wire value, or null for [unknown].
  String? toWire() => this == unknown ? null : wireValue;
}
