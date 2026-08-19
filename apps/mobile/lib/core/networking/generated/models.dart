// GENERATED CODE — DO NOT MODIFY BY HAND.
//
// Data-transfer objects for the Karar API.
//
// Source:     packages/api-contracts/openapi/openapi.yaml
// Contract:   Karar API 0.6.0
// Digest:     5b91c963
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

/// What this platform's relationship with the issuer actually IS. The vocabulary contains one value, and it is the honest one: no issuer named in the catalogue exposes an interface to Karar, no credential of any kind is stored, and nothing may render "Connected", "Synced" or "Linked" for data a person typed or uploaded. The two booleans-by-enum are stated on the wire so a client cannot infer otherwise from a status it recognises.
@immutable
final class AccountLinkStateDto {
  const AccountLinkStateDto({
    required this.impliesLiveInstitutionLink,
    required this.providerAccessStatus,
    required this.state,
  });

  /// Decodes the contract representation.
  factory AccountLinkStateDto.fromJson(Map<String, Object?> json) => AccountLinkStateDto(
        impliesLiveInstitutionLink: json['impliesLiveInstitutionLink']! as bool,
        providerAccessStatus: AccountLinkStateProviderAccessStatusDto.fromWire(json['providerAccessStatus']! as String),
        state: AccountLinkStateStateDto.fromWire(json['state']! as String),
      );

  final bool impliesLiveInstitutionLink;

  final AccountLinkStateProviderAccessStatusDto providerAccessStatus;

  final AccountLinkStateStateDto state;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'impliesLiveInstitutionLink': impliesLiveInstitutionLink,
        'providerAccessStatus': providerAccessStatus.toWire(),
        'state': state.toWire(),
      };

  @override
  String toString() => 'AccountLinkStateDto()';
}

/// Contract enumeration.
enum AccountLinkStateProviderAccessStatusDto {
  notImplemented('NOT_IMPLEMENTED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const AccountLinkStateProviderAccessStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static AccountLinkStateProviderAccessStatusDto fromWire(String? value) {
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
enum AccountLinkStateStateDto {
  notLinked('NOT_LINKED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const AccountLinkStateStateDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static AccountLinkStateStateDto fromWire(String? value) {
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
final class AccountNatureDto {
  const AccountNatureDto();

  /// Decodes the contract representation.
  factory AccountNatureDto.fromJson(Map<String, Object?> json) =>
      const AccountNatureDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'AccountNatureDto()';
}

/// Contract object.
@immutable
final class AccountOriginDto {
  const AccountOriginDto();

  /// Decodes the contract representation.
  factory AccountOriginDto.fromJson(Map<String, Object?> json) =>
      const AccountOriginDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'AccountOriginDto()';
}

/// The safe source-and-freshness summary. This is the ONLY shape a read path returns for a source link; the stored entity carries the external account reference and its keyed fingerprint, and neither has a field here.
@immutable
final class AccountSourceLinkViewDto {
  const AccountSourceLinkViewDto({
    required this.accountId,
    required this.availability,
    required this.capabilities,
    required this.connectionId,
    required this.createdAt,
    this.historyCoverage,
    required this.link,
    required this.matchBasis,
    required this.observation,
    required this.rail,
    required this.sourceAuthority,
    required this.sourceLinkId,
    required this.sourcePriority,
    required this.status,
    this.subjectConfirmedAt,
    required this.updatedAt,
    required this.version,
  });

  /// Decodes the contract representation.
  factory AccountSourceLinkViewDto.fromJson(Map<String, Object?> json) => AccountSourceLinkViewDto(
        accountId: json['accountId']! as String,
        availability: RailAvailabilityDto.fromJson(json['availability']! as Map<String, Object?>),
        capabilities: SourceCapabilitiesViewDto.fromJson(json['capabilities']! as Map<String, Object?>),
        connectionId: json['connectionId']! as String,
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        historyCoverage: json['historyCoverage'] == null ? null : HistoryCoverageViewDto.fromJson(json['historyCoverage']! as Map<String, Object?>),
        link: InstitutionLinkClaimDto.fromJson(json['link']! as Map<String, Object?>),
        matchBasis: MatchBasisDto.fromJson(json['matchBasis']! as Map<String, Object?>),
        observation: SourceObservationViewDto.fromJson(json['observation']! as Map<String, Object?>),
        rail: ConnectionRailDto.fromJson(json['rail']! as Map<String, Object?>),
        sourceAuthority: SourceAuthorityDto.fromJson(json['sourceAuthority']! as Map<String, Object?>),
        sourceLinkId: json['sourceLinkId']! as String,
        sourcePriority: json['sourcePriority']! as int,
        status: SourceLinkStatusDto.fromJson(json['status']! as Map<String, Object?>),
        subjectConfirmedAt: json['subjectConfirmedAt'] == null ? null : DateTime.parse(json['subjectConfirmedAt']! as String).toUtc(),
        updatedAt: DateTime.parse(json['updatedAt']! as String).toUtc(),
        version: json['version']! as int,
      );

  final String accountId;

  final RailAvailabilityDto availability;

  final SourceCapabilitiesViewDto capabilities;

  final String connectionId;

  final DateTime createdAt;

  /// The calendar range this source has supplied, as DAYS (ADR-0027). Null when nothing has been supplied.
  final HistoryCoverageViewDto? historyCoverage;

  final InstitutionLinkClaimDto link;

  final MatchBasisDto matchBasis;

  final SourceObservationViewDto observation;

  final ConnectionRailDto rail;

  final SourceAuthorityDto sourceAuthority;

  final String sourceLinkId;

  final int sourcePriority;

  final SourceLinkStatusDto status;

  /// When the person confirmed this link, or null while they have not.
  final DateTime? subjectConfirmedAt;

  final DateTime updatedAt;

  final int version;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'availability': availability.toJson(),
        'capabilities': capabilities.toJson(),
        'connectionId': connectionId,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'historyCoverage': historyCoverage?.toJson(),
        'link': link.toJson(),
        'matchBasis': matchBasis.toJson(),
        'observation': observation.toJson(),
        'rail': rail.toJson(),
        'sourceAuthority': sourceAuthority.toJson(),
        'sourceLinkId': sourceLinkId,
        'sourcePriority': sourcePriority,
        'status': status.toJson(),
        'subjectConfirmedAt': subjectConfirmedAt?.toUtc().toIso8601String(),
        'updatedAt': updatedAt.toUtc().toIso8601String(),
        'version': version,
      };

  @override
  String toString() => 'AccountSourceLinkViewDto()';
}

/// Contract object.
@immutable
final class AccountStatusDto {
  const AccountStatusDto();

  /// Decodes the contract representation.
  factory AccountStatusDto.fromJson(Map<String, Object?> json) =>
      const AccountStatusDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'AccountStatusDto()';
}

/// Contract object.
@immutable
final class AccountTypeDto {
  const AccountTypeDto();

  /// Decodes the contract representation.
  factory AccountTypeDto.fromJson(Map<String, Object?> json) =>
      const AccountTypeDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'AccountTypeDto()';
}

/// How the amount is expressed in the file. A signed column needs its SIGN FRAME stated — a bank ledger and an account holder disagree about which way is positive — and a debit/credit pair needs both columns.
@immutable
sealed class AmountColumnsDto {
  const AmountColumnsDto();

  /// Decodes the branch named by `kind`.
  ///
  /// An unrecognised discriminator throws [FormatException]: a union the
  /// client cannot classify must not be guessed at, and the transport turns
  /// the throw into a typed contract-violation failure.
  factory AmountColumnsDto.fromJson(Map<String, Object?> json) {
    final discriminator = json['kind'];
    return switch (discriminator) {
      'DEBIT_CREDIT' => AmountColumnsDebitCreditDto.fromJson(json),
      'SIGNED' => AmountColumnsSignedDto.fromJson(json),
      _ => throw FormatException(
          'Unknown kind for AmountColumnsDto.',
        ),
    };
  }

  /// The raw discriminator value for this branch.
  String get kind;

  /// Encodes this branch, including its discriminator.
  Map<String, Object?> toJson();
}

/// The `DEBIT_CREDIT` branch of [AmountColumnsDto].
@immutable
final class AmountColumnsDebitCreditDto extends AmountColumnsDto {
  const AmountColumnsDebitCreditDto({
    required this.creditColumn,
    required this.debitColumn,
  });

  /// Decodes this branch.
  factory AmountColumnsDebitCreditDto.fromJson(Map<String, Object?> json) =>
      AmountColumnsDebitCreditDto(
        creditColumn: json['creditColumn']! as int,
        debitColumn: json['debitColumn']! as int,
      );

  final int creditColumn;

  final int debitColumn;

  @override
  String get kind => 'DEBIT_CREDIT';

  @override
  Map<String, Object?> toJson() => <String, Object?>{
        'kind': 'DEBIT_CREDIT',
        'creditColumn': creditColumn,
        'debitColumn': debitColumn,
      };

  @override
  String toString() => 'AmountColumnsDebitCreditDto()';
}

/// The `SIGNED` branch of [AmountColumnsDto].
@immutable
final class AmountColumnsSignedDto extends AmountColumnsDto {
  const AmountColumnsSignedDto({
    required this.amountColumn,
    required this.signFrame,
  });

  /// Decodes this branch.
  factory AmountColumnsSignedDto.fromJson(Map<String, Object?> json) =>
      AmountColumnsSignedDto(
        amountColumn: json['amountColumn']! as int,
        signFrame: AmountColumnsSignedSignFrameDto.fromWire(json['signFrame']! as String),
      );

  final int amountColumn;

  final AmountColumnsSignedSignFrameDto signFrame;

  @override
  String get kind => 'SIGNED';

  @override
  Map<String, Object?> toJson() => <String, Object?>{
        'kind': 'SIGNED',
        'amountColumn': amountColumn,
        'signFrame': signFrame.toWire(),
      };

  @override
  String toString() => 'AmountColumnsSignedDto()';
}

/// Contract enumeration.
enum AmountColumnsSignedSignFrameDto {
  accountHolder('ACCOUNT_HOLDER'),
  bankLedger('BANK_LEDGER'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const AmountColumnsSignedSignFrameDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static AmountColumnsSignedSignFrameDto fromWire(String? value) {
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
final class AssignOwnTransactionCategoryRequestDto {
  const AssignOwnTransactionCategoryRequestDto({
    required this.categoryCode,
  });

  /// Decodes the contract representation.
  factory AssignOwnTransactionCategoryRequestDto.fromJson(Map<String, Object?> json) => AssignOwnTransactionCategoryRequestDto(
        categoryCode: CategoryCodeDto.fromJson(json['categoryCode']! as Map<String, Object?>),
      );

  final CategoryCodeDto categoryCode;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'categoryCode': categoryCode.toJson(),
      };

  @override
  String toString() => 'AssignOwnTransactionCategoryRequestDto()';
}

/// Who decided. There is no AI member and no SUGGESTED member: this platform assigns categories deterministically or a person does.
@immutable
final class AssignmentSourceDto {
  const AssignmentSourceDto();

  /// Decodes the contract representation.
  factory AssignmentSourceDto.fromJson(Map<String, Object?> json) =>
      const AssignmentSourceDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'AssignmentSourceDto()';
}

/// Contract object.
@immutable
final class AssignmentStatusDto {
  const AssignmentStatusDto();

  /// Decodes the contract representation.
  factory AssignmentStatusDto.fromJson(Map<String, Object?> json) =>
      const AssignmentStatusDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'AssignmentStatusDto()';
}

/// Contract object.
@immutable
final class AuthenticatedSessionDto {
  const AuthenticatedSessionDto({
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
    required this.refreshTokenExpiresAt,
    required this.sessionId,
    required this.status,
  });

  /// Decodes the contract representation.
  factory AuthenticatedSessionDto.fromJson(Map<String, Object?> json) => AuthenticatedSessionDto(
        accessToken: json['accessToken']! as String,
        accessTokenExpiresAt: DateTime.parse(json['accessTokenExpiresAt']! as String).toUtc(),
        refreshToken: json['refreshToken']! as String,
        refreshTokenExpiresAt: DateTime.parse(json['refreshTokenExpiresAt']! as String).toUtc(),
        sessionId: json['sessionId']! as String,
        status: AuthenticatedSessionStatusDto.fromWire(json['status']! as String),
      );

  /// ES256 JWT, 10 minutes. Carries no roles, permissions, or e-mail.
  final String accessToken;

  final DateTime accessTokenExpiresAt;

  /// The RAW one-time refresh token — returned here and nowhere else; only its SHA-256 digest is stored. Rotated on every use.
  final String refreshToken;

  final DateTime refreshTokenExpiresAt;

  final String sessionId;

  final AuthenticatedSessionStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accessToken': accessToken,
        'accessTokenExpiresAt': accessTokenExpiresAt.toUtc().toIso8601String(),
        'refreshToken': refreshToken,
        'refreshTokenExpiresAt': refreshTokenExpiresAt.toUtc().toIso8601String(),
        'sessionId': sessionId,
        'status': status.toWire(),
      };

  @override
  String toString() => 'AuthenticatedSessionDto()';
}

/// Contract enumeration.
enum AuthenticatedSessionStatusDto {
  authenticated('authenticated'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const AuthenticatedSessionStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static AuthenticatedSessionStatusDto fromWire(String? value) {
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
final class BalanceKindDto {
  const BalanceKindDto();

  /// Decodes the contract representation.
  factory BalanceKindDto.fromJson(Map<String, Object?> json) =>
      const BalanceKindDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'BalanceKindDto()';
}

/// One figure a source reported, with the kind it reported and the moment it was true. `asOf` and `capturedAt` are INSTANTS, not calendar days: they are moments, and typing them as days would invent a timezone.
/// Deliberately absent: the source's own reference (an opaque internal identifier that is not the subject's to read on this route), the row's tenant and user, and anything derived — nothing here sums, nets or converts.
@immutable
final class BalanceSnapshotViewDto {
  const BalanceSnapshotViewDto({
    required this.accountId,
    required this.amount,
    required this.asOf,
    required this.availability,
    required this.balanceKind,
    required this.capturedAt,
    required this.snapshotId,
    required this.sourceKind,
  });

  /// Decodes the contract representation.
  factory BalanceSnapshotViewDto.fromJson(Map<String, Object?> json) => BalanceSnapshotViewDto(
        accountId: json['accountId']! as String,
        amount: MinorUnitAmountDto.fromJson(json['amount']! as Map<String, Object?>),
        asOf: DateTime.parse(json['asOf']! as String).toUtc(),
        availability: RailAvailabilityDto.fromJson(json['availability']! as Map<String, Object?>),
        balanceKind: BalanceKindDto.fromJson(json['balanceKind']! as Map<String, Object?>),
        capturedAt: DateTime.parse(json['capturedAt']! as String).toUtc(),
        snapshotId: json['snapshotId']! as String,
        sourceKind: SourceKindDto.fromJson(json['sourceKind']! as Map<String, Object?>),
      );

  final String accountId;

  final MinorUnitAmountDto amount;

  /// The moment the source says this figure was true.
  final DateTime asOf;

  final RailAvailabilityDto availability;

  final BalanceKindDto balanceKind;

  /// The moment this platform recorded it.
  final DateTime capturedAt;

  final String snapshotId;

  final SourceKindDto sourceKind;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'amount': amount.toJson(),
        'asOf': asOf.toUtc().toIso8601String(),
        'availability': availability.toJson(),
        'balanceKind': balanceKind.toJson(),
        'capturedAt': capturedAt.toUtc().toIso8601String(),
        'snapshotId': snapshotId,
        'sourceKind': sourceKind.toJson(),
      };

  @override
  String toString() => 'BalanceSnapshotViewDto()';
}

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

/// Who decided this category and when. There is no confidence and no score. `ruleVersion` is present only for a RULE assignment and is null for a person's own choice.
@immutable
final class CategoryAssignmentViewDto {
  const CategoryAssignmentViewDto({
    required this.assignedAt,
    required this.assignmentId,
    required this.assignmentSource,
    required this.categoryCode,
    this.ruleVersion,
    required this.status,
  });

  /// Decodes the contract representation.
  factory CategoryAssignmentViewDto.fromJson(Map<String, Object?> json) => CategoryAssignmentViewDto(
        assignedAt: DateTime.parse(json['assignedAt']! as String).toUtc(),
        assignmentId: json['assignmentId']! as String,
        assignmentSource: AssignmentSourceDto.fromJson(json['assignmentSource']! as Map<String, Object?>),
        categoryCode: CategoryCodeDto.fromJson(json['categoryCode']! as Map<String, Object?>),
        ruleVersion: json['ruleVersion'] as String?,
        status: AssignmentStatusDto.fromJson(json['status']! as Map<String, Object?>),
      );

  final DateTime assignedAt;

  final String assignmentId;

  final AssignmentSourceDto assignmentSource;

  final CategoryCodeDto categoryCode;

  final String? ruleVersion;

  final AssignmentStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'assignedAt': assignedAt.toUtc().toIso8601String(),
        'assignmentId': assignmentId,
        'assignmentSource': assignmentSource.toJson(),
        'categoryCode': categoryCode.toJson(),
        'ruleVersion': ruleVersion,
        'status': status.toJson(),
      };

  @override
  String toString() => 'CategoryAssignmentViewDto()';
}

/// A dotted catalogue code, at most three levels deep.
@immutable
final class CategoryCodeDto {
  const CategoryCodeDto();

  /// Decodes the contract representation.
  factory CategoryCodeDto.fromJson(Map<String, Object?> json) =>
      const CategoryCodeDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'CategoryCodeDto()';
}

/// Contract object.
@immutable
final class CategoryViewDto {
  const CategoryViewDto({
    required this.assignable,
    required this.catalogueVersion,
    required this.code,
    required this.labels,
    this.parentCode,
    this.retiredAt,
  });

  /// Decodes the contract representation.
  factory CategoryViewDto.fromJson(Map<String, Object?> json) => CategoryViewDto(
        assignable: json['assignable']! as bool,
        catalogueVersion: json['catalogueVersion']! as String,
        code: CategoryCodeDto.fromJson(json['code']! as Map<String, Object?>),
        labels: CategoryViewLabelsDto.fromJson(json['labels']! as Map<String, Object?>),
        parentCode: json['parentCode'] == null ? null : CategoryCodeDto.fromJson(json['parentCode']! as Map<String, Object?>),
        retiredAt: json['retiredAt'] == null ? null : DateTime.parse(json['retiredAt']! as String).toUtc(),
      );

  /// Whether this entry may be chosen now.
  final bool assignable;

  final String catalogueVersion;

  final CategoryCodeDto code;

  final CategoryViewLabelsDto labels;

  final CategoryCodeDto? parentCode;

  final DateTime? retiredAt;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'assignable': assignable,
        'catalogueVersion': catalogueVersion,
        'code': code.toJson(),
        'labels': labels.toJson(),
        'parentCode': parentCode?.toJson(),
        'retiredAt': retiredAt?.toUtc().toIso8601String(),
      };

  @override
  String toString() => 'CategoryViewDto()';
}

/// Contract object.
@immutable
final class CategoryViewLabelsDto {
  const CategoryViewLabelsDto({
    required this.ar,
    required this.en,
  });

  /// Decodes the contract representation.
  factory CategoryViewLabelsDto.fromJson(Map<String, Object?> json) => CategoryViewLabelsDto(
        ar: json['ar']! as String,
        en: json['en']! as String,
      );

  final String ar;

  final String en;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'ar': ar,
        'en': en,
      };

  @override
  String toString() => 'CategoryViewLabelsDto()';
}

/// Contract object.
@immutable
final class CommitOwnStatementImportRequestDto {
  const CommitOwnStatementImportRequestDto({
    required this.expectedVersion,
  });

  /// Decodes the contract representation.
  factory CommitOwnStatementImportRequestDto.fromJson(Map<String, Object?> json) => CommitOwnStatementImportRequestDto(
        expectedVersion: json['expectedVersion']! as int,
      );

  final int expectedVersion;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'expectedVersion': expectedVersion,
      };

  @override
  String toString() => 'CommitOwnStatementImportRequestDto()';
}

/// Contract object.
@immutable
final class ConfirmOwnTransferMatchRequestDto {
  const ConfirmOwnTransferMatchRequestDto({
    required this.expectedVersion,
  });

  /// Decodes the contract representation.
  factory ConfirmOwnTransferMatchRequestDto.fromJson(Map<String, Object?> json) => ConfirmOwnTransferMatchRequestDto(
        expectedVersion: json['expectedVersion']! as int,
      );

  final int expectedVersion;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'expectedVersion': expectedVersion,
      };

  @override
  String toString() => 'ConfirmOwnTransferMatchRequestDto()';
}

/// How data arrives. Thirteen rails are NAMED because the vocabulary has to describe the world; exactly two may be WRITTEN. Naming a rail is not a claim that it works, which is why `availability` travels beside it everywhere.
@immutable
final class ConnectionRailDto {
  const ConnectionRailDto();

  /// Decodes the contract representation.
  factory ConnectionRailDto.fromJson(Map<String, Object?> json) =>
      const ConnectionRailDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'ConnectionRailDto()';
}

/// The connection's own lifecycle. NOT ONE OF THESE MEANS CONNECTED: ACTIVE means the connection accepts data the subject supplies.
@immutable
final class ConnectionStatusDto {
  const ConnectionStatusDto();

  /// Decodes the contract representation.
  factory ConnectionStatusDto.fromJson(Map<String, Object?> json) =>
      const ConnectionStatusDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'ConnectionStatusDto()';
}

/// A safe summary. Deliberately absent, and to stay absent: `tenantId` and `userId`; any credential of any kind (none is stored); any ciphertext, nonce, auth tag, algorithm or key version; and any synchronisation cursor or last-sync token, which would imply a sync that does not exist.
@immutable
final class ConnectionSummaryViewDto {
  const ConnectionSummaryViewDto({
    required this.availability,
    required this.connectionId,
    required this.createdAt,
    required this.displayLabel,
    this.institutionId,
    required this.link,
    required this.rail,
    required this.status,
    required this.updatedAt,
    required this.version,
  });

  /// Decodes the contract representation.
  factory ConnectionSummaryViewDto.fromJson(Map<String, Object?> json) => ConnectionSummaryViewDto(
        availability: RailAvailabilityDto.fromJson(json['availability']! as Map<String, Object?>),
        connectionId: json['connectionId']! as String,
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        displayLabel: json['displayLabel']! as String,
        institutionId: json['institutionId'] as String?,
        link: InstitutionLinkClaimDto.fromJson(json['link']! as Map<String, Object?>),
        rail: ConnectionRailDto.fromJson(json['rail']! as Map<String, Object?>),
        status: ConnectionStatusDto.fromJson(json['status']! as Map<String, Object?>),
        updatedAt: DateTime.parse(json['updatedAt']! as String).toUtc(),
        version: json['version']! as int,
      );

  final RailAvailabilityDto availability;

  final String connectionId;

  final DateTime createdAt;

  /// The subject's own name for this connection, decrypted for its owner.
  final String displayLabel;

  final String? institutionId;

  final InstitutionLinkClaimDto link;

  final ConnectionRailDto rail;

  final ConnectionStatusDto status;

  final DateTime updatedAt;

  final int version;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'availability': availability.toJson(),
        'connectionId': connectionId,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'displayLabel': displayLabel,
        'institutionId': institutionId,
        'link': link.toJson(),
        'rail': rail.toJson(),
        'status': status.toJson(),
        'updatedAt': updatedAt.toUtc().toIso8601String(),
        'version': version,
      };

  @override
  String toString() => 'ConnectionSummaryViewDto()';
}

/// Contract object.
@immutable
final class CorrectOwnTransactionRequestDto {
  const CorrectOwnTransactionRequestDto({
    this.bookingDate,
    this.description,
    this.direction,
    required this.expectedVersion,
    this.magnitude,
    this.merchant,
    this.note,
    this.status,
    this.valueDate,
  });

  /// Decodes the contract representation.
  factory CorrectOwnTransactionRequestDto.fromJson(Map<String, Object?> json) => CorrectOwnTransactionRequestDto(
        bookingDate: json['bookingDate'] as String?,
        description: json['description'] as String?,
        direction: json['direction'] == null ? null : MoneyDirectionDto.fromJson(json['direction']! as Map<String, Object?>),
        expectedVersion: json['expectedVersion']! as int,
        magnitude: json['magnitude'] == null ? null : MinorUnitAmountDto.fromJson(json['magnitude']! as Map<String, Object?>),
        merchant: json['merchant'] as String?,
        note: json['note'] as String?,
        status: json['status'] == null ? null : TransactionStatusDto.fromJson(json['status']! as Map<String, Object?>),
        valueDate: json['valueDate'] as String?,
      );

  final String? bookingDate;

  final String? description;

  final MoneyDirectionDto? direction;

  final int expectedVersion;

  final MinorUnitAmountDto? magnitude;

  final String? merchant;

  final String? note;

  final TransactionStatusDto? status;

  final String? valueDate;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'bookingDate': bookingDate,
        'description': description,
        'direction': direction?.toJson(),
        'expectedVersion': expectedVersion,
        'magnitude': magnitude?.toJson(),
        'merchant': merchant,
        'note': note,
        'status': status?.toJson(),
        'valueDate': valueDate,
      };

  @override
  String toString() => 'CorrectOwnTransactionRequestDto()';
}

/// Contract object.
@immutable
final class CreateOwnManualFinancialAccountRequestDto {
  const CreateOwnManualFinancialAccountRequestDto({
    required this.accountType,
    required this.currency,
    required this.displayName,
    this.institutionId,
    this.mask,
    this.nature,
    this.userSuppliedInstitutionLabel,
    this.walletKind,
  });

  /// Decodes the contract representation.
  factory CreateOwnManualFinancialAccountRequestDto.fromJson(Map<String, Object?> json) => CreateOwnManualFinancialAccountRequestDto(
        accountType: AccountTypeDto.fromJson(json['accountType']! as Map<String, Object?>),
        currency: json['currency']! as String,
        displayName: json['displayName']! as String,
        institutionId: json['institutionId'] as String?,
        mask: json['mask'] as String?,
        nature: json['nature'] == null ? null : AccountNatureDto.fromJson(json['nature']! as Map<String, Object?>),
        userSuppliedInstitutionLabel: json['userSuppliedInstitutionLabel'] as String?,
        walletKind: json['walletKind'] == null ? null : WalletKindDto.fromJson(json['walletKind']! as Map<String, Object?>),
      );

  final AccountTypeDto accountType;

  /// ISO 4217 alphabetic code; immutable once records exist.
  final String currency;

  /// Holder-sensitive. Stored only as ciphertext bound by AAD to tenant, user, table, row and field.
  final String displayName;

  /// A reviewed catalogue entry, or null.
  final String? institutionId;

  /// A masked tail, e.g. `**1234`. A value that reads as a full account or card number is refused rather than stored.
  final String? mask;

  final AccountNatureDto? nature;

  /// The subject's own name for an issuer the catalogue does not hold. Never promoted to reference data.
  final String? userSuppliedInstitutionLabel;

  /// Required when `accountType` is WALLET and refused otherwise — the database holds the same biconditional (migration 0095).
  final WalletKindDto? walletKind;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountType': accountType.toJson(),
        'currency': currency,
        'displayName': displayName,
        'institutionId': institutionId,
        'mask': mask,
        'nature': nature?.toJson(),
        'userSuppliedInstitutionLabel': userSuppliedInstitutionLabel,
        'walletKind': walletKind?.toJson(),
      };

  @override
  String toString() => 'CreateOwnManualFinancialAccountRequestDto()';
}

/// Contract object.
@immutable
final class CreateOwnManualTransactionRequestDto {
  const CreateOwnManualTransactionRequestDto({
    required this.accountId,
    required this.bookingDate,
    required this.description,
    required this.direction,
    this.eventOccurredAt,
    required this.magnitude,
    this.merchant,
    this.note,
    this.occurrenceOrdinal,
    this.originalAmount,
    this.sourceTimezone,
    this.valueDate,
  });

  /// Decodes the contract representation.
  factory CreateOwnManualTransactionRequestDto.fromJson(Map<String, Object?> json) => CreateOwnManualTransactionRequestDto(
        accountId: json['accountId']! as String,
        bookingDate: json['bookingDate']! as String,
        description: json['description']! as String,
        direction: MoneyDirectionDto.fromJson(json['direction']! as Map<String, Object?>),
        eventOccurredAt: json['eventOccurredAt'] == null ? null : DateTime.parse(json['eventOccurredAt']! as String).toUtc(),
        magnitude: MinorUnitAmountDto.fromJson(json['magnitude']! as Map<String, Object?>),
        merchant: json['merchant'] as String?,
        note: json['note'] as String?,
        occurrenceOrdinal: json['occurrenceOrdinal'] as int?,
        originalAmount: json['originalAmount'] == null ? null : MinorUnitAmountDto.fromJson(json['originalAmount']! as Map<String, Object?>),
        sourceTimezone: json['sourceTimezone'] as String?,
        valueDate: json['valueDate'] as String?,
      );

  final String accountId;

  /// The day the institution booked it. A calendar day, never an instant.
  final String bookingDate;

  final String description;

  final MoneyDirectionDto direction;

  /// A true instant, recorded only when the source stated one. Requires `sourceTimezone` to be meaningful and refuses it when absent.
  final DateTime? eventOccurredAt;

  final MinorUnitAmountDto magnitude;

  final String? merchant;

  final String? note;

  /// Which occurrence of an otherwise identical movement this is, so a person who genuinely bought the same coffee twice can record both. Must be the next unused ordinal.
  final int? occurrenceOrdinal;

  /// The amount as the source stated it, when that differs in currency from the booked amount. All-or-nothing: a magnitude without a currency is refused, not half-recorded.
  final MinorUnitAmountDto? originalAmount;

  /// IANA zone name; refused unless `eventOccurredAt` is present.
  final String? sourceTimezone;

  final String? valueDate;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'bookingDate': bookingDate,
        'description': description,
        'direction': direction.toJson(),
        'eventOccurredAt': eventOccurredAt?.toUtc().toIso8601String(),
        'magnitude': magnitude.toJson(),
        'merchant': merchant,
        'note': note,
        'occurrenceOrdinal': occurrenceOrdinal,
        'originalAmount': originalAmount?.toJson(),
        'sourceTimezone': sourceTimezone,
        'valueDate': valueDate,
      };

  @override
  String toString() => 'CreateOwnManualTransactionRequestDto()';
}

/// Contract object.
@immutable
final class CreateOwnStatementImportRequestDto {
  const CreateOwnStatementImportRequestDto({
    required this.accountId,
    this.connectionId,
  });

  /// Decodes the contract representation.
  factory CreateOwnStatementImportRequestDto.fromJson(Map<String, Object?> json) => CreateOwnStatementImportRequestDto(
        accountId: json['accountId']! as String,
        connectionId: json['connectionId'] as String?,
      );

  /// One of the caller's OWN accounts.
  final String accountId;

  /// The caller's own USER_FILE_UPLOAD connection, when they are attributing this file to one. Null attributes it to none.
  final String? connectionId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'connectionId': connectionId,
      };

  @override
  String toString() => 'CreateOwnStatementImportRequestDto()';
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
final class CurrencyViewDto {
  const CurrencyViewDto({
    required this.code,
    required this.exponent,
  });

  /// Decodes the contract representation.
  factory CurrencyViewDto.fromJson(Map<String, Object?> json) => CurrencyViewDto(
        code: json['code']! as String,
        exponent: json['exponent']! as int,
      );

  final String code;

  final int exponent;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'code': code,
        'exponent': exponent,
      };

  @override
  String toString() => 'CurrencyViewDto()';
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

/// How the source's statement was turned into the canonical sign.
@immutable
final class DirectionMappingDto {
  const DirectionMappingDto();

  /// Decodes the contract representation.
  factory DirectionMappingDto.fromJson(Map<String, Object?> json) =>
      const DirectionMappingDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'DirectionMappingDto()';
}

/// Contract object.
@immutable
final class EmailVerifiedResultDto {
  const EmailVerifiedResultDto({
    required this.status,
  });

  /// Decodes the contract representation.
  factory EmailVerifiedResultDto.fromJson(Map<String, Object?> json) => EmailVerifiedResultDto(
        status: EmailVerifiedResultStatusDto.fromWire(json['status']! as String),
      );

  final EmailVerifiedResultStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'status': status.toWire(),
      };

  @override
  String toString() => 'EmailVerifiedResultDto()';
}

/// Contract enumeration.
enum EmailVerifiedResultStatusDto {
  verified('verified'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const EmailVerifiedResultStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static EmailVerifiedResultStatusDto fromWire(String? value) {
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

/// The caller's own account. Every optional value is present-and-null rather than omitted, so absence is something the contract states rather than something a client infers from a missing key.
/// Deliberately absent, and to stay absent: `tenantId` and `userId` (the caller IS the subject); any ciphertext, nonce, auth tag, encryption algorithm or key version; any external account identifier or fingerprint; and any balance — a balance is a reported fact with its own route, and a figure on the account row would be a second number free to disagree with it.
@immutable
final class FinancialAccountViewDto {
  const FinancialAccountViewDto({
    required this.accountId,
    required this.accountType,
    required this.createdAt,
    required this.currency,
    required this.displayName,
    this.institution,
    required this.link,
    this.mask,
    required this.nature,
    required this.origin,
    required this.status,
    required this.updatedAt,
    this.userSuppliedInstitutionLabel,
    required this.version,
    this.walletKind,
  });

  /// Decodes the contract representation.
  factory FinancialAccountViewDto.fromJson(Map<String, Object?> json) => FinancialAccountViewDto(
        accountId: json['accountId']! as String,
        accountType: AccountTypeDto.fromJson(json['accountType']! as Map<String, Object?>),
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        currency: CurrencyViewDto.fromJson(json['currency']! as Map<String, Object?>),
        displayName: json['displayName']! as String,
        institution: json['institution'] == null ? null : InstitutionViewDto.fromJson(json['institution']! as Map<String, Object?>),
        link: AccountLinkStateDto.fromJson(json['link']! as Map<String, Object?>),
        mask: json['mask'] as String?,
        nature: AccountNatureDto.fromJson(json['nature']! as Map<String, Object?>),
        origin: AccountOriginDto.fromJson(json['origin']! as Map<String, Object?>),
        status: AccountStatusDto.fromJson(json['status']! as Map<String, Object?>),
        updatedAt: DateTime.parse(json['updatedAt']! as String).toUtc(),
        userSuppliedInstitutionLabel: json['userSuppliedInstitutionLabel'] as String?,
        version: json['version']! as int,
        walletKind: json['walletKind'] == null ? null : WalletKindDto.fromJson(json['walletKind']! as Map<String, Object?>),
      );

  final String accountId;

  final AccountTypeDto accountType;

  final DateTime createdAt;

  final CurrencyViewDto currency;

  /// The subject's own name for the account, decrypted for its owner.
  final String displayName;

  /// The reviewed catalogue entry this account points at, resolved for display, or null when the subject named no catalogue issuer. A RETIRED entry still resolves here — an existing record has to remain readable.
  final InstitutionViewDto? institution;

  final AccountLinkStateDto link;

  final String? mask;

  final AccountNatureDto nature;

  final AccountOriginDto origin;

  final AccountStatusDto status;

  final DateTime updatedAt;

  final String? userSuppliedInstitutionLabel;

  final int version;

  final WalletKindDto? walletKind;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'accountType': accountType.toJson(),
        'createdAt': createdAt.toUtc().toIso8601String(),
        'currency': currency.toJson(),
        'displayName': displayName,
        'institution': institution?.toJson(),
        'link': link.toJson(),
        'mask': mask,
        'nature': nature.toJson(),
        'origin': origin.toJson(),
        'status': status.toJson(),
        'updatedAt': updatedAt.toUtc().toIso8601String(),
        'userSuppliedInstitutionLabel': userSuppliedInstitutionLabel,
        'version': version,
        'walletKind': walletKind?.toJson(),
      };

  @override
  String toString() => 'FinancialAccountViewDto()';
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
final class HistoryCoverageViewDto {
  const HistoryCoverageViewDto({
    required this.end,
    required this.start,
  });

  /// Decodes the contract representation.
  factory HistoryCoverageViewDto.fromJson(Map<String, Object?> json) => HistoryCoverageViewDto(
        end: json['end']! as String,
        start: json['start']! as String,
      );

  final String end;

  final String start;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'end': end,
        'start': start,
      };

  @override
  String toString() => 'HistoryCoverageViewDto()';
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

/// Discriminated union keyed on `status`.
@immutable
sealed class IdentityLoginResponseDto {
  const IdentityLoginResponseDto();

  /// Decodes the branch named by `status`.
  ///
  /// An unrecognised discriminator throws [FormatException]: a union the
  /// client cannot classify must not be guessed at, and the transport turns
  /// the throw into a typed contract-violation failure.
  factory IdentityLoginResponseDto.fromJson(Map<String, Object?> json) {
    final discriminator = json['status'];
    return switch (discriminator) {
      'authenticated' => IdentityLoginResponseAuthenticatedDto.fromJson(json),
      'mfa_required' => IdentityLoginResponseMfaRequiredDto.fromJson(json),
      _ => throw FormatException(
          'Unknown status for IdentityLoginResponseDto.',
        ),
    };
  }

  /// The raw discriminator value for this branch.
  String get status;

  /// Encodes this branch, including its discriminator.
  Map<String, Object?> toJson();
}

/// The `authenticated` branch of [IdentityLoginResponseDto].
@immutable
final class IdentityLoginResponseAuthenticatedDto extends IdentityLoginResponseDto {
  const IdentityLoginResponseAuthenticatedDto({
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
    required this.refreshTokenExpiresAt,
    required this.sessionId,
  });

  /// Decodes this branch.
  factory IdentityLoginResponseAuthenticatedDto.fromJson(Map<String, Object?> json) =>
      IdentityLoginResponseAuthenticatedDto(
        accessToken: json['accessToken']! as String,
        accessTokenExpiresAt: DateTime.parse(json['accessTokenExpiresAt']! as String).toUtc(),
        refreshToken: json['refreshToken']! as String,
        refreshTokenExpiresAt: DateTime.parse(json['refreshTokenExpiresAt']! as String).toUtc(),
        sessionId: json['sessionId']! as String,
      );

  /// ES256 JWT, 10 minutes. Carries no roles, permissions, or e-mail.
  final String accessToken;

  final DateTime accessTokenExpiresAt;

  /// The RAW one-time refresh token — returned here and nowhere else; only its SHA-256 digest is stored. Rotated on every use.
  final String refreshToken;

  final DateTime refreshTokenExpiresAt;

  final String sessionId;

  @override
  String get status => 'authenticated';

  @override
  Map<String, Object?> toJson() => <String, Object?>{
        'status': 'authenticated',
        'accessToken': accessToken,
        'accessTokenExpiresAt': accessTokenExpiresAt.toUtc().toIso8601String(),
        'refreshToken': refreshToken,
        'refreshTokenExpiresAt': refreshTokenExpiresAt.toUtc().toIso8601String(),
        'sessionId': sessionId,
      };

  @override
  String toString() => 'IdentityLoginResponseAuthenticatedDto()';
}

/// The `mfa_required` branch of [IdentityLoginResponseDto].
@immutable
final class IdentityLoginResponseMfaRequiredDto extends IdentityLoginResponseDto {
  const IdentityLoginResponseMfaRequiredDto({
    required this.challengeExpiresAt,
    required this.challengeToken,
  });

  /// Decodes this branch.
  factory IdentityLoginResponseMfaRequiredDto.fromJson(Map<String, Object?> json) =>
      IdentityLoginResponseMfaRequiredDto(
        challengeExpiresAt: DateTime.parse(json['challengeExpiresAt']! as String).toUtc(),
        challengeToken: json['challengeToken']! as String,
      );

  final DateTime challengeExpiresAt;

  /// Short-lived (5 minutes) proof that the password step passed. It authenticates /auth/mfa/challenge and /auth/mfa/recovery and nothing else; it is not a session.
  final String challengeToken;

  @override
  String get status => 'mfa_required';

  @override
  Map<String, Object?> toJson() => <String, Object?>{
        'status': 'mfa_required',
        'challengeExpiresAt': challengeExpiresAt.toUtc().toIso8601String(),
        'challengeToken': challengeToken,
      };

  @override
  String toString() => 'IdentityLoginResponseMfaRequiredDto()';
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

/// Counts only. `probableDuplicateCount` is present and is 0: probable- duplicate detection is not implemented, and a field that quietly did not exist would read as "none found" rather than "none looked for".
@immutable
final class ImportCountsViewDto {
  const ImportCountsViewDto({
    required this.committedTransactionCount,
    required this.exactDuplicateCount,
    required this.invalidRowCount,
    required this.probableDuplicateCount,
    required this.rowCount,
    required this.validRowCount,
  });

  /// Decodes the contract representation.
  factory ImportCountsViewDto.fromJson(Map<String, Object?> json) => ImportCountsViewDto(
        committedTransactionCount: json['committedTransactionCount']! as int,
        exactDuplicateCount: json['exactDuplicateCount']! as int,
        invalidRowCount: json['invalidRowCount']! as int,
        probableDuplicateCount: json['probableDuplicateCount']! as int,
        rowCount: json['rowCount']! as int,
        validRowCount: json['validRowCount']! as int,
      );

  final int committedTransactionCount;

  final int exactDuplicateCount;

  final int invalidRowCount;

  final int probableDuplicateCount;

  final int rowCount;

  final int validRowCount;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'committedTransactionCount': committedTransactionCount,
        'exactDuplicateCount': exactDuplicateCount,
        'invalidRowCount': invalidRowCount,
        'probableDuplicateCount': probableDuplicateCount,
        'rowCount': rowCount,
        'validRowCount': validRowCount,
      };

  @override
  String toString() => 'ImportCountsViewDto()';
}

/// Why an import was refused. A closed vocabulary; never free prose from a file.
@immutable
final class ImportRefusalCodeDto {
  const ImportRefusalCodeDto();

  /// Decodes the contract representation.
  factory ImportRefusalCodeDto.fromJson(Map<String, Object?> json) =>
      const ImportRefusalCodeDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'ImportRefusalCodeDto()';
}

/// Contract object.
@immutable
final class ImportStateDto {
  const ImportStateDto();

  /// Decodes the contract representation.
  factory ImportStateDto.fromJson(Map<String, Object?> json) =>
      const ImportStateDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'ImportStateDto()';
}

/// Contract object.
@immutable
final class InstitutionKindDto {
  const InstitutionKindDto();

  /// Decodes the contract representation.
  factory InstitutionKindDto.fromJson(Map<String, Object?> json) =>
      const InstitutionKindDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'InstitutionKindDto()';
}

/// Emitted on the wire so the claim is checkable rather than merely stated in prose. `impliesLiveInstitutionLink` is false for every value of every status vocabulary on this surface, and no issuer exposes an interface to this platform.
@immutable
final class InstitutionLinkClaimDto {
  const InstitutionLinkClaimDto({
    required this.impliesLiveInstitutionLink,
    required this.providerAccessStatus,
  });

  /// Decodes the contract representation.
  factory InstitutionLinkClaimDto.fromJson(Map<String, Object?> json) => InstitutionLinkClaimDto(
        impliesLiveInstitutionLink: json['impliesLiveInstitutionLink']! as bool,
        providerAccessStatus: InstitutionLinkClaimProviderAccessStatusDto.fromWire(json['providerAccessStatus']! as String),
      );

  final bool impliesLiveInstitutionLink;

  final InstitutionLinkClaimProviderAccessStatusDto providerAccessStatus;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'impliesLiveInstitutionLink': impliesLiveInstitutionLink,
        'providerAccessStatus': providerAccessStatus.toWire(),
      };

  @override
  String toString() => 'InstitutionLinkClaimDto()';
}

/// Contract enumeration.
enum InstitutionLinkClaimProviderAccessStatusDto {
  notImplemented('NOT_IMPLEMENTED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const InstitutionLinkClaimProviderAccessStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static InstitutionLinkClaimProviderAccessStatusDto fromWire(String? value) {
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

/// A reviewed catalogue row. It carries no tenant, no user, no country and no market: market presence is a separate per-country concern (`institution_markets`) and is not fabricated here.
@immutable
final class InstitutionViewDto {
  const InstitutionViewDto({
    required this.code,
    required this.displayNameAr,
    required this.displayNameEn,
    required this.institutionId,
    required this.kind,
    required this.status,
  });

  /// Decodes the contract representation.
  factory InstitutionViewDto.fromJson(Map<String, Object?> json) => InstitutionViewDto(
        code: json['code']! as String,
        displayNameAr: json['displayNameAr']! as String,
        displayNameEn: json['displayNameEn']! as String,
        institutionId: json['institutionId']! as String,
        kind: InstitutionKindDto.fromJson(json['kind']! as Map<String, Object?>),
        status: InstitutionViewStatusDto.fromWire(json['status']! as String),
      );

  final String code;

  final String displayNameAr;

  final String displayNameEn;

  final String institutionId;

  final InstitutionKindDto kind;

  final InstitutionViewStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'code': code,
        'displayNameAr': displayNameAr,
        'displayNameEn': displayNameEn,
        'institutionId': institutionId,
        'kind': kind.toJson(),
        'status': status.toWire(),
      };

  @override
  String toString() => 'InstitutionViewDto()';
}

/// Contract enumeration.
enum InstitutionViewStatusDto {
  active('ACTIVE'),
  retired('RETIRED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const InstitutionViewStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static InstitutionViewStatusDto fromWire(String? value) {
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

/// The instrument's own lifecycle. TOKENIZED_CARD is a TYPE, not a live provisioning state, and no member of this vocabulary means the issuer is reachable.
@immutable
final class InstrumentStatusDto {
  const InstrumentStatusDto();

  /// Decodes the contract representation.
  factory InstrumentStatusDto.fromJson(Map<String, Object?> json) =>
      const InstrumentStatusDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'InstrumentStatusDto()';
}

/// Contract object.
@immutable
final class InstrumentTypeDto {
  const InstrumentTypeDto();

  /// Decodes the contract representation.
  factory InstrumentTypeDto.fromJson(Map<String, Object?> json) =>
      const InstrumentTypeDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'InstrumentTypeDto()';
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

/// Emitted on the wire so the claim is checkable rather than merely stated. `impliesLiveIssuerLink` is false for every status the vocabulary permits; no issuer exposes an interface to this platform and no credential of any kind is stored.
@immutable
final class IssuerLinkClaimDto {
  const IssuerLinkClaimDto({
    required this.impliesLiveIssuerLink,
    required this.providerAccessStatus,
  });

  /// Decodes the contract representation.
  factory IssuerLinkClaimDto.fromJson(Map<String, Object?> json) => IssuerLinkClaimDto(
        impliesLiveIssuerLink: json['impliesLiveIssuerLink']! as bool,
        providerAccessStatus: IssuerLinkClaimProviderAccessStatusDto.fromWire(json['providerAccessStatus']! as String),
      );

  final bool impliesLiveIssuerLink;

  final IssuerLinkClaimProviderAccessStatusDto providerAccessStatus;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'impliesLiveIssuerLink': impliesLiveIssuerLink,
        'providerAccessStatus': providerAccessStatus.toWire(),
      };

  @override
  String toString() => 'IssuerLinkClaimDto()';
}

/// Contract enumeration.
enum IssuerLinkClaimProviderAccessStatusDto {
  notImplemented('NOT_IMPLEMENTED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const IssuerLinkClaimProviderAccessStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static IssuerLinkClaimProviderAccessStatusDto fromWire(String? value) {
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
final class ListFinancialCategoriesResponseDto {
  const ListFinancialCategoriesResponseDto({
    required this.items,
    required this.page,
  });

  /// Decodes the contract representation.
  factory ListFinancialCategoriesResponseDto.fromJson(Map<String, Object?> json) => ListFinancialCategoriesResponseDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => CategoryViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
      );

  final List<CategoryViewDto> items;

  final PageInfoDto page;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((CategoryViewDto element) => element.toJson())
            .toList(growable: false),
        'page': page.toJson(),
      };

  @override
  String toString() => 'ListFinancialCategoriesResponseDto()';
}

/// Contract object.
@immutable
final class ListFinancialInstitutionsResponseDto {
  const ListFinancialInstitutionsResponseDto({
    required this.items,
    required this.page,
  });

  /// Decodes the contract representation.
  factory ListFinancialInstitutionsResponseDto.fromJson(Map<String, Object?> json) => ListFinancialInstitutionsResponseDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => InstitutionViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
      );

  final List<InstitutionViewDto> items;

  final PageInfoDto page;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((InstitutionViewDto element) => element.toJson())
            .toList(growable: false),
        'page': page.toJson(),
      };

  @override
  String toString() => 'ListFinancialInstitutionsResponseDto()';
}

/// Contract object.
@immutable
final class ListOwnAccountBalanceSnapshotsResponseDto {
  const ListOwnAccountBalanceSnapshotsResponseDto({
    required this.items,
    required this.page,
  });

  /// Decodes the contract representation.
  factory ListOwnAccountBalanceSnapshotsResponseDto.fromJson(Map<String, Object?> json) => ListOwnAccountBalanceSnapshotsResponseDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => BalanceSnapshotViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
      );

  final List<BalanceSnapshotViewDto> items;

  final PageInfoDto page;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((BalanceSnapshotViewDto element) => element.toJson())
            .toList(growable: false),
        'page': page.toJson(),
      };

  @override
  String toString() => 'ListOwnAccountBalanceSnapshotsResponseDto()';
}

/// Contract object.
@immutable
final class ListOwnAccountPaymentInstrumentsResponseDto {
  const ListOwnAccountPaymentInstrumentsResponseDto({
    required this.items,
    required this.page,
  });

  /// Decodes the contract representation.
  factory ListOwnAccountPaymentInstrumentsResponseDto.fromJson(Map<String, Object?> json) => ListOwnAccountPaymentInstrumentsResponseDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => PaymentInstrumentViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
      );

  final List<PaymentInstrumentViewDto> items;

  final PageInfoDto page;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((PaymentInstrumentViewDto element) => element.toJson())
            .toList(growable: false),
        'page': page.toJson(),
      };

  @override
  String toString() => 'ListOwnAccountPaymentInstrumentsResponseDto()';
}

/// Contract object.
@immutable
final class ListOwnAccountSourceLinksResponseDto {
  const ListOwnAccountSourceLinksResponseDto({
    required this.items,
    required this.page,
  });

  /// Decodes the contract representation.
  factory ListOwnAccountSourceLinksResponseDto.fromJson(Map<String, Object?> json) => ListOwnAccountSourceLinksResponseDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => AccountSourceLinkViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
      );

  final List<AccountSourceLinkViewDto> items;

  final PageInfoDto page;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((AccountSourceLinkViewDto element) => element.toJson())
            .toList(growable: false),
        'page': page.toJson(),
      };

  @override
  String toString() => 'ListOwnAccountSourceLinksResponseDto()';
}

/// Contract object.
@immutable
final class ListOwnFinancialAccountsResponseDto {
  const ListOwnFinancialAccountsResponseDto({
    required this.items,
    required this.page,
  });

  /// Decodes the contract representation.
  factory ListOwnFinancialAccountsResponseDto.fromJson(Map<String, Object?> json) => ListOwnFinancialAccountsResponseDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => FinancialAccountViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
      );

  final List<FinancialAccountViewDto> items;

  final PageInfoDto page;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((FinancialAccountViewDto element) => element.toJson())
            .toList(growable: false),
        'page': page.toJson(),
      };

  @override
  String toString() => 'ListOwnFinancialAccountsResponseDto()';
}

/// Contract object.
@immutable
final class ListOwnFinancialConnectionsResponseDto {
  const ListOwnFinancialConnectionsResponseDto({
    required this.items,
    required this.page,
  });

  /// Decodes the contract representation.
  factory ListOwnFinancialConnectionsResponseDto.fromJson(Map<String, Object?> json) => ListOwnFinancialConnectionsResponseDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => ConnectionSummaryViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
      );

  final List<ConnectionSummaryViewDto> items;

  final PageInfoDto page;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((ConnectionSummaryViewDto element) => element.toJson())
            .toList(growable: false),
        'page': page.toJson(),
      };

  @override
  String toString() => 'ListOwnFinancialConnectionsResponseDto()';
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
final class ListOwnTransactionProvenanceResponseDto {
  const ListOwnTransactionProvenanceResponseDto({
    required this.items,
    required this.page,
  });

  /// Decodes the contract representation.
  factory ListOwnTransactionProvenanceResponseDto.fromJson(Map<String, Object?> json) => ListOwnTransactionProvenanceResponseDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => ProvenanceViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
      );

  final List<ProvenanceViewDto> items;

  final PageInfoDto page;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((ProvenanceViewDto element) => element.toJson())
            .toList(growable: false),
        'page': page.toJson(),
      };

  @override
  String toString() => 'ListOwnTransactionProvenanceResponseDto()';
}

/// Contract object.
@immutable
final class ListOwnTransactionsResponseDto {
  const ListOwnTransactionsResponseDto({
    required this.items,
    required this.page,
  });

  /// Decodes the contract representation.
  factory ListOwnTransactionsResponseDto.fromJson(Map<String, Object?> json) => ListOwnTransactionsResponseDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => TransactionViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
      );

  final List<TransactionViewDto> items;

  final PageInfoDto page;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((TransactionViewDto element) => element.toJson())
            .toList(growable: false),
        'page': page.toJson(),
      };

  @override
  String toString() => 'ListOwnTransactionsResponseDto()';
}

/// Contract object.
@immutable
final class ListOwnTransferMatchesResponseDto {
  const ListOwnTransferMatchesResponseDto({
    required this.items,
    required this.page,
  });

  /// Decodes the contract representation.
  factory ListOwnTransferMatchesResponseDto.fromJson(Map<String, Object?> json) => ListOwnTransferMatchesResponseDto(
        items: (json['items']! as List<Object?>)
            .map((Object? element) => TransferMatchViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
      );

  final List<TransferMatchViewDto> items;

  final PageInfoDto page;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'items': items
            .map((TransferMatchViewDto element) => element.toJson())
            .toList(growable: false),
        'page': page.toJson(),
      };

  @override
  String toString() => 'ListOwnTransferMatchesResponseDto()';
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
final class LoggedOutResultDto {
  const LoggedOutResultDto({
    required this.status,
  });

  /// Decodes the contract representation.
  factory LoggedOutResultDto.fromJson(Map<String, Object?> json) => LoggedOutResultDto(
        status: LoggedOutResultStatusDto.fromWire(json['status']! as String),
      );

  final LoggedOutResultStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'status': status.toWire(),
      };

  @override
  String toString() => 'LoggedOutResultDto()';
}

/// Contract enumeration.
enum LoggedOutResultStatusDto {
  loggedOut('logged_out'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const LoggedOutResultStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static LoggedOutResultStatusDto fromWire(String? value) {
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

/// Why this source was linked to this account. EXACT_EXTERNAL_REFERENCE or PROBABLE, and nothing in between — there is no confidence score in this platform and none may be invented for display.
@immutable
final class MatchBasisDto {
  const MatchBasisDto();

  /// Decodes the contract representation.
  factory MatchBasisDto.fromJson(Map<String, Object?> json) =>
      const MatchBasisDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'MatchBasisDto()';
}

/// One side of the relationship. It carries no amount and no date: those belong to the transaction it names, which the caller can read on the transactions surface. A copy here would be free to disagree with it.
@immutable
final class MatchSideViewDto {
  const MatchSideViewDto({
    required this.accountId,
    required this.currency,
    required this.transactionId,
  });

  /// Decodes the contract representation.
  factory MatchSideViewDto.fromJson(Map<String, Object?> json) => MatchSideViewDto(
        accountId: json['accountId']! as String,
        currency: json['currency']! as String,
        transactionId: json['transactionId']! as String,
      );

  final String accountId;

  final String currency;

  final String transactionId;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'currency': currency,
        'transactionId': transactionId,
      };

  @override
  String toString() => 'MatchSideViewDto()';
}

/// Contract object.
@immutable
final class MatchStateDto {
  const MatchStateDto();

  /// Decodes the contract representation.
  factory MatchStateDto.fromJson(Map<String, Object?> json) =>
      const MatchStateDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'MatchStateDto()';
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

/// Contract object.
@immutable
final class MfaConfirmedDto {
  const MfaConfirmedDto({
    required this.recoveryCodes,
    required this.status,
  });

  /// Decodes the contract representation.
  factory MfaConfirmedDto.fromJson(Map<String, Object?> json) => MfaConfirmedDto(
        recoveryCodes: (json['recoveryCodes']! as List<Object?>)
            .map((Object? element) => element! as String)
            .toList(growable: false),
        status: MfaConfirmedStatusDto.fromWire(json['status']! as String),
      );

  /// Ten single-use recovery codes, delivered exactly once. The platform keeps only their digests; there is no route that re-issues them.
  final List<String> recoveryCodes;

  final MfaConfirmedStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'recoveryCodes': recoveryCodes
            .map((String element) => element)
            .toList(growable: false),
        'status': status.toWire(),
      };

  @override
  String toString() => 'MfaConfirmedDto()';
}

/// Contract enumeration.
enum MfaConfirmedStatusDto {
  confirmed('confirmed'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const MfaConfirmedStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static MfaConfirmedStatusDto fromWire(String? value) {
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
final class MfaDisabledResultDto {
  const MfaDisabledResultDto({
    required this.status,
  });

  /// Decodes the contract representation.
  factory MfaDisabledResultDto.fromJson(Map<String, Object?> json) => MfaDisabledResultDto(
        status: MfaDisabledResultStatusDto.fromWire(json['status']! as String),
      );

  final MfaDisabledResultStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'status': status.toWire(),
      };

  @override
  String toString() => 'MfaDisabledResultDto()';
}

/// Contract enumeration.
enum MfaDisabledResultStatusDto {
  disabled('disabled'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const MfaDisabledResultStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static MfaDisabledResultStatusDto fromWire(String? value) {
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
final class MfaEnrolmentStartedDto {
  const MfaEnrolmentStartedDto({
    required this.otpauthUrl,
    required this.secret,
    required this.status,
  });

  /// Decodes the contract representation.
  factory MfaEnrolmentStartedDto.fromJson(Map<String, Object?> json) => MfaEnrolmentStartedDto(
        otpauthUrl: json['otpauthUrl']! as String,
        secret: json['secret']! as String,
        status: MfaEnrolmentStartedStatusDto.fromWire(json['status']! as String),
      );

  /// The same secret in otpauth form, for a QR code. It EMBEDS the secret: treat it as the credential it is.
  final String otpauthUrl;

  /// The base32 TOTP shared secret, delivered exactly once. It rests encrypted under a versioned key and is never readable again — a client that loses it must restart enrolment.
  final String secret;

  final MfaEnrolmentStartedStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'otpauthUrl': otpauthUrl,
        'secret': secret,
        'status': status.toWire(),
      };

  @override
  String toString() => 'MfaEnrolmentStartedDto()';
}

/// Contract enumeration.
enum MfaEnrolmentStartedStatusDto {
  enrolmentStarted('enrolment_started'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const MfaEnrolmentStartedStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static MfaEnrolmentStartedStatusDto fromWire(String? value) {
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

/// An exact amount. `minorUnits` is the signed integer the ledger holds, serialized as CHARACTERS — never a JSON number, because a number is a float and a float is not a ledger value (ADR-0006). `exponent` is the currency's ISO 4217 minor-unit exponent, supplied so a client can render without a currency table of its own; it is not a licence to divide.
@immutable
final class MinorUnitAmountDto {
  const MinorUnitAmountDto({
    required this.currency,
    required this.exponent,
    required this.minorUnits,
  });

  /// Decodes the contract representation.
  factory MinorUnitAmountDto.fromJson(Map<String, Object?> json) => MinorUnitAmountDto(
        currency: json['currency']! as String,
        exponent: json['exponent']! as int,
        minorUnits: json['minorUnits']! as String,
      );

  final String currency;

  final int exponent;

  final String minorUnits;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'currency': currency,
        'exponent': exponent,
        'minorUnits': minorUnits,
      };

  @override
  String toString() => 'MinorUnitAmountDto()';
}

/// An exact integer count of minor units, serialized as CHARACTERS. Never a JSON number: a number is a float, and a float is not a ledger value (ADR-0006).
@immutable
final class MinorUnitStringDto {
  const MinorUnitStringDto();

  /// Decodes the contract representation.
  factory MinorUnitStringDto.fromJson(Map<String, Object?> json) =>
      const MinorUnitStringDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'MinorUnitStringDto()';
}

/// MONEY_OUT is money leaving the account and is stored negative; MONEY_IN is money arriving and is stored positive. One convention, named on the wire, so nobody has to infer it from a sign.
@immutable
final class MoneyDirectionDto {
  const MoneyDirectionDto();

  /// Decodes the contract representation.
  factory MoneyDirectionDto.fromJson(Map<String, Object?> json) =>
      const MoneyDirectionDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'MoneyDirectionDto()';
}

/// Contract object.
@immutable
final class NeutralReceiptDto {
  const NeutralReceiptDto({
    required this.detail,
    required this.status,
  });

  /// Decodes the contract representation.
  factory NeutralReceiptDto.fromJson(Map<String, Object?> json) => NeutralReceiptDto(
        detail: json['detail']! as String,
        status: NeutralReceiptStatusDto.fromWire(json['status']! as String),
      );

  /// Fixed, conditional prose ("if the address is eligible…"). It states no fact about the address and never varies.
  final String detail;

  final NeutralReceiptStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'detail': detail,
        'status': status.toWire(),
      };

  @override
  String toString() => 'NeutralReceiptDto()';
}

/// Contract enumeration.
enum NeutralReceiptStatusDto {
  accepted('accepted'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const NeutralReceiptStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static NeutralReceiptStatusDto fromWire(String? value) {
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
final class OtherSessionsRevokedDto {
  const OtherSessionsRevokedDto({
    required this.revokedCount,
    required this.status,
  });

  /// Decodes the contract representation.
  factory OtherSessionsRevokedDto.fromJson(Map<String, Object?> json) => OtherSessionsRevokedDto(
        revokedCount: json['revokedCount']! as int,
        status: OtherSessionsRevokedStatusDto.fromWire(json['status']! as String),
      );

  final int revokedCount;

  final OtherSessionsRevokedStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'revokedCount': revokedCount,
        'status': status.toWire(),
      };

  @override
  String toString() => 'OtherSessionsRevokedDto()';
}

/// Contract enumeration.
enum OtherSessionsRevokedStatusDto {
  revoked('revoked'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const OtherSessionsRevokedStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static OtherSessionsRevokedStatusDto fromWire(String? value) {
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

/// What this page IS, stated rather than inferred. `hasMore` is explicit so an empty page is a stated end rather than something a client guesses at, and `nextCursor` is null exactly when there is no next page.
@immutable
final class PageInfoDto {
  const PageInfoDto({
    required this.hasMore,
    required this.limit,
    this.nextCursor,
    required this.returned,
  });

  /// Decodes the contract representation.
  factory PageInfoDto.fromJson(Map<String, Object?> json) => PageInfoDto(
        hasMore: json['hasMore']! as bool,
        limit: json['limit']! as int,
        nextCursor: json['nextCursor'] as String?,
        returned: json['returned']! as int,
      );

  final bool hasMore;

  final int limit;

  final String? nextCursor;

  final int returned;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'hasMore': hasMore,
        'limit': limit,
        'nextCursor': nextCursor,
        'returned': returned,
      };

  @override
  String toString() => 'PageInfoDto()';
}

/// Contract object.
@immutable
final class ParseOwnStatementImportSourceRequestDto {
  const ParseOwnStatementImportSourceRequestDto({
    required this.mapping,
    this.statedBalance,
  });

  /// Decodes the contract representation.
  factory ParseOwnStatementImportSourceRequestDto.fromJson(Map<String, Object?> json) => ParseOwnStatementImportSourceRequestDto(
        mapping: StatementColumnMappingDto.fromJson(json['mapping']! as Map<String, Object?>),
        statedBalance: json['statedBalance'] == null ? null : StatedStatementBalanceDto.fromJson(json['statedBalance']! as Map<String, Object?>),
      );

  final StatementColumnMappingDto mapping;

  /// The balance the statement itself states, for reconciliation. Null when the statement states none.
  final StatedStatementBalanceDto? statedBalance;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'mapping': mapping.toJson(),
        'statedBalance': statedBalance?.toJson(),
      };

  @override
  String toString() => 'ParseOwnStatementImportSourceRequestDto()';
}

/// Contract object.
@immutable
final class PasswordChangedResultDto {
  const PasswordChangedResultDto({
    required this.status,
  });

  /// Decodes the contract representation.
  factory PasswordChangedResultDto.fromJson(Map<String, Object?> json) => PasswordChangedResultDto(
        status: PasswordChangedResultStatusDto.fromWire(json['status']! as String),
      );

  final PasswordChangedResultStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'status': status.toWire(),
      };

  @override
  String toString() => 'PasswordChangedResultDto()';
}

/// Contract enumeration.
enum PasswordChangedResultStatusDto {
  changed('changed'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const PasswordChangedResultStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static PasswordChangedResultStatusDto fromWire(String? value) {
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
final class PasswordResetResultDto {
  const PasswordResetResultDto({
    required this.status,
  });

  /// Decodes the contract representation.
  factory PasswordResetResultDto.fromJson(Map<String, Object?> json) => PasswordResetResultDto(
        status: PasswordResetResultStatusDto.fromWire(json['status']! as String),
      );

  final PasswordResetResultStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'status': status.toWire(),
      };

  @override
  String toString() => 'PasswordResetResultDto()';
}

/// Contract enumeration.
enum PasswordResetResultStatusDto {
  reset('reset'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const PasswordResetResultStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static PasswordResetResultStatusDto fromWire(String? value) {
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

/// One instrument. `version` is the ONLY number in this object, and that is the point: the question "how much is on this card" has no answer in this platform and must not acquire one here.
@immutable
final class PaymentInstrumentViewDto {
  const PaymentInstrumentViewDto({
    required this.accountId,
    required this.createdAt,
    required this.displayLabel,
    required this.instrumentId,
    required this.instrumentType,
    required this.issuerLink,
    required this.mask,
    required this.spendable,
    required this.status,
    required this.updatedAt,
    required this.version,
  });

  /// Decodes the contract representation.
  factory PaymentInstrumentViewDto.fromJson(Map<String, Object?> json) => PaymentInstrumentViewDto(
        accountId: json['accountId']! as String,
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        displayLabel: json['displayLabel']! as String,
        instrumentId: json['instrumentId']! as String,
        instrumentType: InstrumentTypeDto.fromJson(json['instrumentType']! as Map<String, Object?>),
        issuerLink: IssuerLinkClaimDto.fromJson(json['issuerLink']! as Map<String, Object?>),
        mask: json['mask']! as String,
        spendable: json['spendable']! as bool,
        status: InstrumentStatusDto.fromJson(json['status']! as Map<String, Object?>),
        updatedAt: DateTime.parse(json['updatedAt']! as String).toUtc(),
        version: json['version']! as int,
      );

  /// The single balance-bearing account this instrument spends from. Singular and required; there is no field through which it could be re-pointed.
  final String accountId;

  final DateTime createdAt;

  /// The subject's own name for the instrument, decrypted for its owner.
  final String displayLabel;

  final String instrumentId;

  final InstrumentTypeDto instrumentType;

  final IssuerLinkClaimDto issuerLink;

  /// A short masked tail, e.g. `**1234`, decrypted for its owner. Never a full number: a value that reads as one is refused at the domain.
  final String mask;

  /// Whether this instrument may currently be used to spend, stated rather than derived from the status vocabulary.
  final bool spendable;

  final InstrumentStatusDto status;

  final DateTime updatedAt;

  final int version;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'displayLabel': displayLabel,
        'instrumentId': instrumentId,
        'instrumentType': instrumentType.toJson(),
        'issuerLink': issuerLink.toJson(),
        'mask': mask,
        'spendable': spendable,
        'status': status.toJson(),
        'updatedAt': updatedAt.toUtc().toIso8601String(),
        'version': version,
      };

  @override
  String toString() => 'PaymentInstrumentViewDto()';
}

/// How this import was processed. `fingerprintVersion` is the ALGORITHM version, never a fingerprint.
@immutable
final class ProcessingVersionsViewDto {
  const ProcessingVersionsViewDto({
    required this.fingerprintVersion,
    required this.mappingVersion,
    required this.normalizationVersion,
    required this.parserVersion,
  });

  /// Decodes the contract representation.
  factory ProcessingVersionsViewDto.fromJson(Map<String, Object?> json) => ProcessingVersionsViewDto(
        fingerprintVersion: json['fingerprintVersion']! as String,
        mappingVersion: json['mappingVersion']! as String,
        normalizationVersion: json['normalizationVersion']! as String,
        parserVersion: json['parserVersion']! as String,
      );

  final String fingerprintVersion;

  final String mappingVersion;

  final String normalizationVersion;

  final String parserVersion;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'fingerprintVersion': fingerprintVersion,
        'mappingVersion': mappingVersion,
        'normalizationVersion': normalizationVersion,
        'parserVersion': parserVersion,
      };

  @override
  String toString() => 'ProcessingVersionsViewDto()';
}

/// Contract enumeration.
enum ProvenanceViewCategoryAssignmentSourceDto {
  none('NONE'),
  rule('RULE'),
  user('USER'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const ProvenanceViewCategoryAssignmentSourceDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static ProvenanceViewCategoryAssignmentSourceDto fromWire(String? value) {
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

/// The safe projection. `importedFromStatement` reports EXISTENCE of a statement origin as a boolean; the import id and the row reference are not carried, because a row reference is a handle into staged source content.
@immutable
final class ProvenanceViewDto {
  const ProvenanceViewDto({
    required this.accountId,
    required this.availability,
    required this.categoryAssignmentSource,
    required this.createdAt,
    required this.directionMapping,
    required this.importedFromStatement,
    required this.revisionNumber,
    required this.sourceDirection,
    required this.sourceKind,
    required this.versions,
  });

  /// Decodes the contract representation.
  factory ProvenanceViewDto.fromJson(Map<String, Object?> json) => ProvenanceViewDto(
        accountId: json['accountId']! as String,
        availability: RailAvailabilityDto.fromJson(json['availability']! as Map<String, Object?>),
        categoryAssignmentSource: ProvenanceViewCategoryAssignmentSourceDto.fromWire(json['categoryAssignmentSource']! as String),
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        directionMapping: DirectionMappingDto.fromJson(json['directionMapping']! as Map<String, Object?>),
        importedFromStatement: json['importedFromStatement']! as bool,
        revisionNumber: json['revisionNumber']! as int,
        sourceDirection: SourceDirectionDto.fromJson(json['sourceDirection']! as Map<String, Object?>),
        sourceKind: SourceKindDto.fromJson(json['sourceKind']! as Map<String, Object?>),
        versions: ProcessingVersionsViewDto.fromJson(json['versions']! as Map<String, Object?>),
      );

  final String accountId;

  final RailAvailabilityDto availability;

  final ProvenanceViewCategoryAssignmentSourceDto categoryAssignmentSource;

  final DateTime createdAt;

  final DirectionMappingDto directionMapping;

  final bool importedFromStatement;

  final int revisionNumber;

  final SourceDirectionDto sourceDirection;

  final SourceKindDto sourceKind;

  final ProcessingVersionsViewDto versions;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'availability': availability.toJson(),
        'categoryAssignmentSource': categoryAssignmentSource.toWire(),
        'createdAt': createdAt.toUtc().toIso8601String(),
        'directionMapping': directionMapping.toJson(),
        'importedFromStatement': importedFromStatement,
        'revisionNumber': revisionNumber,
        'sourceDirection': sourceDirection.toJson(),
        'sourceKind': sourceKind.toJson(),
        'versions': versions.toJson(),
      };

  @override
  String toString() => 'ProvenanceViewDto()';
}

/// Whether this platform can actually run the rail today. EXECUTABLE for MANUAL and USER_FILE_UPLOAD, NOT_IMPLEMENTED for every other rail — and the database enforces the same split, so an unimplemented rail cannot be written even by direct SQL.
@immutable
final class RailAvailabilityDto {
  const RailAvailabilityDto();

  /// Decodes the contract representation.
  factory RailAvailabilityDto.fromJson(Map<String, Object?> json) =>
      const RailAvailabilityDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'RailAvailabilityDto()';
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
final class ReadOwnTransactionResponseDto {
  const ReadOwnTransactionResponseDto({
    this.activeCategory,
    required this.divergesFromSource,
    required this.revisions,
    required this.transaction,
  });

  /// Decodes the contract representation.
  factory ReadOwnTransactionResponseDto.fromJson(Map<String, Object?> json) => ReadOwnTransactionResponseDto(
        activeCategory: json['activeCategory'] == null ? null : CategoryAssignmentViewDto.fromJson(json['activeCategory']! as Map<String, Object?>),
        divergesFromSource: json['divergesFromSource']! as bool,
        revisions: (json['revisions']! as List<Object?>)
            .map((Object? element) => TransactionRevisionViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        transaction: TransactionViewDto.fromJson(json['transaction']! as Map<String, Object?>),
      );

  final CategoryAssignmentViewDto? activeCategory;

  /// True when a person has corrected a value the source supplied. The source's own values remain in `revisions`.
  final bool divergesFromSource;

  final List<TransactionRevisionViewDto> revisions;

  final TransactionViewDto transaction;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'activeCategory': activeCategory?.toJson(),
        'divergesFromSource': divergesFromSource,
        'revisions': revisions
            .map((TransactionRevisionViewDto element) => element.toJson())
            .toList(growable: false),
        'transaction': transaction.toJson(),
      };

  @override
  String toString() => 'ReadOwnTransactionResponseDto()';
}

/// Whether the statement's own stated balance agrees with its rows. NOT_AVAILABLE is a real answer — the statement stated no balance, or there was nothing to compare against — and is not the same as MATCHED.
@immutable
final class ReconciliationStatusDto {
  const ReconciliationStatusDto();

  /// Decodes the contract representation.
  factory ReconciliationStatusDto.fromJson(Map<String, Object?> json) =>
      const ReconciliationStatusDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'ReconciliationStatusDto()';
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
final class RefreshedSessionDto {
  const RefreshedSessionDto({
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
    required this.refreshTokenExpiresAt,
    required this.status,
  });

  /// Decodes the contract representation.
  factory RefreshedSessionDto.fromJson(Map<String, Object?> json) => RefreshedSessionDto(
        accessToken: json['accessToken']! as String,
        accessTokenExpiresAt: DateTime.parse(json['accessTokenExpiresAt']! as String).toUtc(),
        refreshToken: json['refreshToken']! as String,
        refreshTokenExpiresAt: DateTime.parse(json['refreshTokenExpiresAt']! as String).toUtc(),
        status: RefreshedSessionStatusDto.fromWire(json['status']! as String),
      );

  final String accessToken;

  final DateTime accessTokenExpiresAt;

  /// The SUCCESSOR token. The presented one is consumed and will not work again.
  final String refreshToken;

  final DateTime refreshTokenExpiresAt;

  final RefreshedSessionStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accessToken': accessToken,
        'accessTokenExpiresAt': accessTokenExpiresAt.toUtc().toIso8601String(),
        'refreshToken': refreshToken,
        'refreshTokenExpiresAt': refreshTokenExpiresAt.toUtc().toIso8601String(),
        'status': status.toWire(),
      };

  @override
  String toString() => 'RefreshedSessionDto()';
}

/// Contract enumeration.
enum RefreshedSessionStatusDto {
  refreshed('refreshed'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const RefreshedSessionStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static RefreshedSessionStatusDto fromWire(String? value) {
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
final class RejectOwnTransferMatchRequestDto {
  const RejectOwnTransferMatchRequestDto({
    required this.expectedVersion,
  });

  /// Decodes the contract representation.
  factory RejectOwnTransferMatchRequestDto.fromJson(Map<String, Object?> json) => RejectOwnTransferMatchRequestDto(
        expectedVersion: json['expectedVersion']! as int,
      );

  final int expectedVersion;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'expectedVersion': expectedVersion,
      };

  @override
  String toString() => 'RejectOwnTransferMatchRequestDto()';
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
final class RevisableFieldDto {
  const RevisableFieldDto();

  /// Decodes the contract representation.
  factory RevisableFieldDto.fromJson(Map<String, Object?> json) =>
      const RevisableFieldDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'RevisableFieldDto()';
}

/// Contract object.
@immutable
final class RevisionAttributionDto {
  const RevisionAttributionDto();

  /// Decodes the contract representation.
  factory RevisionAttributionDto.fromJson(Map<String, Object?> json) =>
      const RevisionAttributionDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'RevisionAttributionDto()';
}

/// A COMPLETE snapshot of the revisable values, never a patch.
@immutable
final class RevisionValuesViewDto {
  const RevisionValuesViewDto({
    required this.amount,
    required this.bookingDate,
    required this.description,
    required this.direction,
    this.eventOccurredAt,
    this.merchant,
    this.note,
    this.sourceTimezone,
    required this.status,
    this.valueDate,
  });

  /// Decodes the contract representation.
  factory RevisionValuesViewDto.fromJson(Map<String, Object?> json) => RevisionValuesViewDto(
        amount: MinorUnitAmountDto.fromJson(json['amount']! as Map<String, Object?>),
        bookingDate: json['bookingDate']! as String,
        description: json['description']! as String,
        direction: MoneyDirectionDto.fromJson(json['direction']! as Map<String, Object?>),
        eventOccurredAt: json['eventOccurredAt'] == null ? null : DateTime.parse(json['eventOccurredAt']! as String).toUtc(),
        merchant: json['merchant'] as String?,
        note: json['note'] as String?,
        sourceTimezone: json['sourceTimezone'] as String?,
        status: TransactionStatusDto.fromJson(json['status']! as Map<String, Object?>),
        valueDate: json['valueDate'] as String?,
      );

  final MinorUnitAmountDto amount;

  final String bookingDate;

  final String description;

  final MoneyDirectionDto direction;

  final DateTime? eventOccurredAt;

  final String? merchant;

  final String? note;

  final String? sourceTimezone;

  final TransactionStatusDto status;

  final String? valueDate;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'amount': amount.toJson(),
        'bookingDate': bookingDate,
        'description': description,
        'direction': direction.toJson(),
        'eventOccurredAt': eventOccurredAt?.toUtc().toIso8601String(),
        'merchant': merchant,
        'note': note,
        'sourceTimezone': sourceTimezone,
        'status': status.toJson(),
        'valueDate': valueDate,
      };

  @override
  String toString() => 'RevisionValuesViewDto()';
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
final class RowErrorReasonCodeDto {
  const RowErrorReasonCodeDto();

  /// Decodes the contract representation.
  factory RowErrorReasonCodeDto.fromJson(Map<String, Object?> json) =>
      const RowErrorReasonCodeDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'RowErrorReasonCodeDto()';
}

/// Exactly three fields, and there is never a fourth. `rowNumber` is 1-based among DATA rows — never an offset into the file — and no cell value accompanies it.
@immutable
final class RowErrorViewDto {
  const RowErrorViewDto({
    required this.reasonCode,
    required this.rowNumber,
    required this.safeField,
  });

  /// Decodes the contract representation.
  factory RowErrorViewDto.fromJson(Map<String, Object?> json) => RowErrorViewDto(
        reasonCode: RowErrorReasonCodeDto.fromJson(json['reasonCode']! as Map<String, Object?>),
        rowNumber: json['rowNumber']! as int,
        safeField: SafeFieldDto.fromJson(json['safeField']! as Map<String, Object?>),
      );

  final RowErrorReasonCodeDto reasonCode;

  final int rowNumber;

  final SafeFieldDto safeField;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'reasonCode': reasonCode.toJson(),
        'rowNumber': rowNumber,
        'safeField': safeField.toJson(),
      };

  @override
  String toString() => 'RowErrorViewDto()';
}

/// WHICH field of a row failed, from a CLOSED module vocabulary — never the file's own header text, which can itself contain an account number.
@immutable
final class SafeFieldDto {
  const SafeFieldDto();

  /// Decodes the contract representation.
  factory SafeFieldDto.fromJson(Map<String, Object?> json) =>
      const SafeFieldDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'SafeFieldDto()';
}

/// Contract object.
@immutable
final class SessionListingDto {
  const SessionListingDto({
    required this.sessions,
  });

  /// Decodes the contract representation.
  factory SessionListingDto.fromJson(Map<String, Object?> json) => SessionListingDto(
        sessions: (json['sessions']! as List<Object?>)
            .map((Object? element) => SessionSummaryDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
      );

  final List<SessionSummaryDto> sessions;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'sessions': sessions
            .map((SessionSummaryDto element) => element.toJson())
            .toList(growable: false),
      };

  @override
  String toString() => 'SessionListingDto()';
}

/// Contract object.
@immutable
final class SessionRevokedResultDto {
  const SessionRevokedResultDto({
    required this.status,
  });

  /// Decodes the contract representation.
  factory SessionRevokedResultDto.fromJson(Map<String, Object?> json) => SessionRevokedResultDto(
        status: SessionRevokedResultStatusDto.fromWire(json['status']! as String),
      );

  final SessionRevokedResultStatusDto status;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'status': status.toWire(),
      };

  @override
  String toString() => 'SessionRevokedResultDto()';
}

/// Contract enumeration.
enum SessionRevokedResultStatusDto {
  revoked('revoked'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const SessionRevokedResultStatusDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static SessionRevokedResultStatusDto fromWire(String? value) {
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
final class SessionSummaryDto {
  const SessionSummaryDto({
    required this.absoluteExpiresAt,
    required this.createdAt,
    required this.current,
    required this.lastSeenAt,
    required this.sessionId,
    this.userAgentSummary,
  });

  /// Decodes the contract representation.
  factory SessionSummaryDto.fromJson(Map<String, Object?> json) => SessionSummaryDto(
        absoluteExpiresAt: DateTime.parse(json['absoluteExpiresAt']! as String).toUtc(),
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        current: json['current']! as bool,
        lastSeenAt: DateTime.parse(json['lastSeenAt']! as String).toUtc(),
        sessionId: json['sessionId']! as String,
        userAgentSummary: json['userAgentSummary'] as String?,
      );

  final DateTime absoluteExpiresAt;

  final DateTime createdAt;

  /// True for the session whose access token made this request.
  final bool current;

  final DateTime lastSeenAt;

  final String sessionId;

  /// A coarse summary ("Chrome on macOS"), never the raw user-agent string. Null when the client sent none — stated rather than omitted, so a client can tell "unknown" from "the server forgot".
  final String? userAgentSummary;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'absoluteExpiresAt': absoluteExpiresAt.toUtc().toIso8601String(),
        'createdAt': createdAt.toUtc().toIso8601String(),
        'current': current,
        'lastSeenAt': lastSeenAt.toUtc().toIso8601String(),
        'sessionId': sessionId,
        'userAgentSummary': userAgentSummary,
      };

  @override
  String toString() => 'SessionSummaryDto()';
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

/// How much weight this source's version of a fact carries.
@immutable
final class SourceAuthorityDto {
  const SourceAuthorityDto();

  /// Decodes the contract representation.
  factory SourceAuthorityDto.fromJson(Map<String, Object?> json) =>
      const SourceAuthorityDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'SourceAuthorityDto()';
}

/// Contract object.
@immutable
final class SourceCapabilitiesViewDto {
  const SourceCapabilitiesViewDto({
    required this.balance,
    required this.pendingTransactions,
  });

  /// Decodes the contract representation.
  factory SourceCapabilitiesViewDto.fromJson(Map<String, Object?> json) => SourceCapabilitiesViewDto(
        balance: SourceCapabilityObservationDto.fromJson(json['balance']! as Map<String, Object?>),
        pendingTransactions: SourceCapabilityObservationDto.fromJson(json['pendingTransactions']! as Map<String, Object?>),
      );

  final SourceCapabilityObservationDto balance;

  final SourceCapabilityObservationDto pendingTransactions;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'balance': balance.toJson(),
        'pendingTransactions': pendingTransactions.toJson(),
      };

  @override
  String toString() => 'SourceCapabilitiesViewDto()';
}

/// What was OBSERVED, not what is supported. NOT_PROVIDED means the source never offered it; NOT_OBSERVED means this platform has not seen it. The two are different answers and are kept apart.
@immutable
final class SourceCapabilityObservationDto {
  const SourceCapabilityObservationDto();

  /// Decodes the contract representation.
  factory SourceCapabilityObservationDto.fromJson(Map<String, Object?> json) =>
      const SourceCapabilityObservationDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'SourceCapabilityObservationDto()';
}

/// What the source itself said, before any mapping.
@immutable
final class SourceDirectionDto {
  const SourceDirectionDto();

  /// Decodes the contract representation.
  factory SourceDirectionDto.fromJson(Map<String, Object?> json) =>
      const SourceDirectionDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'SourceDirectionDto()';
}

/// The rail a stored figure arrived on. EXTERNAL_PROVIDER is in the vocabulary because the column can hold it; no path in this platform can produce it, and `availability` on every rail-bearing response says so.
@immutable
final class SourceKindDto {
  const SourceKindDto();

  /// Decodes the contract representation.
  factory SourceKindDto.fromJson(Map<String, Object?> json) =>
      const SourceKindDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'SourceKindDto()';
}

/// Contract object.
@immutable
final class SourceLinkStatusDto {
  const SourceLinkStatusDto();

  /// Decodes the contract representation.
  factory SourceLinkStatusDto.fromJson(Map<String, Object?> json) =>
      const SourceLinkStatusDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'SourceLinkStatusDto()';
}

/// Freshness as OBSERVATION, not as health. These are instants, not days.
@immutable
final class SourceObservationViewDto {
  const SourceObservationViewDto({
    required this.firstObservedAt,
    required this.lastObservedAt,
    this.lastSuccessfulImportAt,
  });

  /// Decodes the contract representation.
  factory SourceObservationViewDto.fromJson(Map<String, Object?> json) => SourceObservationViewDto(
        firstObservedAt: DateTime.parse(json['firstObservedAt']! as String).toUtc(),
        lastObservedAt: DateTime.parse(json['lastObservedAt']! as String).toUtc(),
        lastSuccessfulImportAt: json['lastSuccessfulImportAt'] == null ? null : DateTime.parse(json['lastSuccessfulImportAt']! as String).toUtc(),
      );

  final DateTime firstObservedAt;

  final DateTime lastObservedAt;

  /// Null when no import has yet succeeded. Never approximated.
  final DateTime? lastSuccessfulImportAt;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'firstObservedAt': firstObservedAt.toUtc().toIso8601String(),
        'lastObservedAt': lastObservedAt.toUtc().toIso8601String(),
        'lastSuccessfulImportAt': lastSuccessfulImportAt?.toUtc().toIso8601String(),
      };

  @override
  String toString() => 'SourceObservationViewDto()';
}

/// What the STATEMENT says its balance is, for reconciliation only.
@immutable
final class StatedStatementBalanceDto {
  const StatedStatementBalanceDto({
    required this.currency,
    required this.kind,
    required this.minorUnits,
  });

  /// Decodes the contract representation.
  factory StatedStatementBalanceDto.fromJson(Map<String, Object?> json) => StatedStatementBalanceDto(
        currency: json['currency']! as String,
        kind: StatedStatementBalanceKindDto.fromWire(json['kind']! as String),
        minorUnits: MinorUnitStringDto.fromJson(json['minorUnits']! as Map<String, Object?>),
      );

  final String currency;

  final StatedStatementBalanceKindDto kind;

  final MinorUnitStringDto minorUnits;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'currency': currency,
        'kind': kind.toWire(),
        'minorUnits': minorUnits.toJson(),
      };

  @override
  String toString() => 'StatedStatementBalanceDto()';
}

/// Contract enumeration.
enum StatedStatementBalanceKindDto {
  available('AVAILABLE'),
  closing('CLOSING'),
  ledger('LEDGER'),
  opening('OPENING'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const StatedStatementBalanceKindDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static StatedStatementBalanceKindDto fromWire(String? value) {
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

/// Stated rather than inferred. `03/04` is two different days depending on the answer, and guessing it wrong moves a person's money.
enum StatementColumnMappingDateOrderDto {
  dayFirst('DAY_FIRST'),
  iso('ISO'),
  monthFirst('MONTH_FIRST'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const StatementColumnMappingDateOrderDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static StatementColumnMappingDateOrderDto fromWire(String? value) {
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

/// Column INDEXES, 0-based. Deliberately not header names: a header is untrusted text from a file, and matching on it is how a column of dates becomes a column of amounts.
/// `accountIdentifierColumn` exists for DETECTION only — it lets the parse notice that a file covers more than one account and refuse. It never selects an account: the account is the one the draft was created against, and a file cannot redirect itself.
@immutable
final class StatementColumnMappingDto {
  const StatementColumnMappingDto({
    this.accountIdentifierColumn,
    required this.amount,
    required this.bookingDateColumn,
    this.currencyColumn,
    this.dateOrder,
    required this.descriptionColumn,
    this.eventOccurredAtColumn,
    required this.hasHeaderRow,
    this.instrumentMaskColumn,
    this.merchantColumn,
    this.sourceBalanceColumn,
    this.sourceBalanceKind,
    this.sourceReferenceColumn,
    this.sourceTimezoneColumn,
    this.statedCurrency,
    this.valueDateColumn,
  });

  /// Decodes the contract representation.
  factory StatementColumnMappingDto.fromJson(Map<String, Object?> json) => StatementColumnMappingDto(
        accountIdentifierColumn: json['accountIdentifierColumn'] as int?,
        amount: AmountColumnsDto.fromJson(json['amount']! as Map<String, Object?>),
        bookingDateColumn: json['bookingDateColumn']! as int,
        currencyColumn: json['currencyColumn'] as int?,
        dateOrder: json['dateOrder'] == null ? null : StatementColumnMappingDateOrderDto.fromWire(json['dateOrder']! as String),
        descriptionColumn: json['descriptionColumn']! as int,
        eventOccurredAtColumn: json['eventOccurredAtColumn'] as int?,
        hasHeaderRow: json['hasHeaderRow']! as bool,
        instrumentMaskColumn: json['instrumentMaskColumn'] as int?,
        merchantColumn: json['merchantColumn'] as int?,
        sourceBalanceColumn: json['sourceBalanceColumn'] as int?,
        sourceBalanceKind: json['sourceBalanceKind'] == null ? null : StatementColumnMappingSourceBalanceKindDto.fromWire(json['sourceBalanceKind']! as String),
        sourceReferenceColumn: json['sourceReferenceColumn'] as int?,
        sourceTimezoneColumn: json['sourceTimezoneColumn'] as int?,
        statedCurrency: json['statedCurrency'] as String?,
        valueDateColumn: json['valueDateColumn'] as int?,
      );

  final int? accountIdentifierColumn;

  final AmountColumnsDto amount;

  final int bookingDateColumn;

  /// Exactly one of `currencyColumn` and `statedCurrency` must be given. Two sources for one currency is an ambiguity, not a fallback.
  final int? currencyColumn;

  /// Stated rather than inferred. `03/04` is two different days depending on the answer, and guessing it wrong moves a person's money.
  final StatementColumnMappingDateOrderDto? dateOrder;

  final int descriptionColumn;

  final int? eventOccurredAtColumn;

  final bool hasHeaderRow;

  final int? instrumentMaskColumn;

  final int? merchantColumn;

  final int? sourceBalanceColumn;

  /// Required when a balance column is given; a balance of unstated kind is unusable.
  final StatementColumnMappingSourceBalanceKindDto? sourceBalanceKind;

  final int? sourceReferenceColumn;

  final int? sourceTimezoneColumn;

  final String? statedCurrency;

  final int? valueDateColumn;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountIdentifierColumn': accountIdentifierColumn,
        'amount': amount.toJson(),
        'bookingDateColumn': bookingDateColumn,
        'currencyColumn': currencyColumn,
        'dateOrder': dateOrder?.toWire(),
        'descriptionColumn': descriptionColumn,
        'eventOccurredAtColumn': eventOccurredAtColumn,
        'hasHeaderRow': hasHeaderRow,
        'instrumentMaskColumn': instrumentMaskColumn,
        'merchantColumn': merchantColumn,
        'sourceBalanceColumn': sourceBalanceColumn,
        'sourceBalanceKind': sourceBalanceKind?.toWire(),
        'sourceReferenceColumn': sourceReferenceColumn,
        'sourceTimezoneColumn': sourceTimezoneColumn,
        'statedCurrency': statedCurrency,
        'valueDateColumn': valueDateColumn,
      };

  @override
  String toString() => 'StatementColumnMappingDto()';
}

/// Required when a balance column is given; a balance of unstated kind is unusable.
enum StatementColumnMappingSourceBalanceKindDto {
  available('AVAILABLE'),
  closing('CLOSING'),
  ledger('LEDGER'),
  running('RUNNING'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const StatementColumnMappingSourceBalanceKindDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static StatementColumnMappingSourceBalanceKindDto fromWire(String? value) {
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

/// What the commit wrote. `alreadyCommitted` true means this was an idempotent retry and nothing was written a second time.
@immutable
final class StatementImportCommittedViewDto {
  const StatementImportCommittedViewDto({
    required this.alreadyCommitted,
    required this.committedTransactionCount,
    required this.importId,
    required this.transactionIds,
  });

  /// Decodes the contract representation.
  factory StatementImportCommittedViewDto.fromJson(Map<String, Object?> json) => StatementImportCommittedViewDto(
        alreadyCommitted: json['alreadyCommitted']! as bool,
        committedTransactionCount: json['committedTransactionCount']! as int,
        importId: json['importId']! as String,
        transactionIds: (json['transactionIds']! as List<Object?>)
            .map((Object? element) => element! as String)
            .toList(growable: false),
      );

  final bool alreadyCommitted;

  final int committedTransactionCount;

  final String importId;

  /// The caller's own new transactions, addressable on the transactions surface.
  final List<String> transactionIds;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'alreadyCommitted': alreadyCommitted,
        'committedTransactionCount': committedTransactionCount,
        'importId': importId,
        'transactionIds': transactionIds
            .map((String element) => element)
            .toList(growable: false),
      };

  @override
  String toString() => 'StatementImportCommittedViewDto()';
}

/// Contract object.
@immutable
final class StatementImportErasedViewDto {
  const StatementImportErasedViewDto({
    required this.importId,
    required this.rowsDeleted,
    required this.storedObjectDeleted,
  });

  /// Decodes the contract representation.
  factory StatementImportErasedViewDto.fromJson(Map<String, Object?> json) => StatementImportErasedViewDto(
        importId: json['importId']! as String,
        rowsDeleted: json['rowsDeleted']! as bool,
        storedObjectDeleted: json['storedObjectDeleted']! as bool,
      );

  final String importId;

  final bool rowsDeleted;

  final bool storedObjectDeleted;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'importId': importId,
        'rowsDeleted': rowsDeleted,
        'storedObjectDeleted': storedObjectDeleted,
      };

  @override
  String toString() => 'StatementImportErasedViewDto()';
}

/// The review surface. `rowErrors` is one PAGE of the bounded report; `reportedErrorCount` is how many the report holds and `totalErrorCount` is how many rows really failed. Both are carried because collapsing them turns a truncated report into a complete-looking one.
@immutable
final class StatementImportPreviewViewDto {
  const StatementImportPreviewViewDto({
    required this.accountId,
    required this.awaitsDecision,
    this.connectionId,
    required this.counts,
    required this.hasStoredSource,
    required this.importId,
    required this.page,
    required this.reconciliationStatus,
    this.refusalCode,
    required this.reportedErrorCount,
    required this.rowErrors,
    required this.state,
    required this.totalErrorCount,
    this.versions,
  });

  /// Decodes the contract representation.
  factory StatementImportPreviewViewDto.fromJson(Map<String, Object?> json) => StatementImportPreviewViewDto(
        accountId: json['accountId']! as String,
        awaitsDecision: json['awaitsDecision']! as bool,
        connectionId: json['connectionId'] as String?,
        counts: ImportCountsViewDto.fromJson(json['counts']! as Map<String, Object?>),
        hasStoredSource: json['hasStoredSource']! as bool,
        importId: json['importId']! as String,
        page: PageInfoDto.fromJson(json['page']! as Map<String, Object?>),
        reconciliationStatus: ReconciliationStatusDto.fromJson(json['reconciliationStatus']! as Map<String, Object?>),
        refusalCode: json['refusalCode'] == null ? null : ImportRefusalCodeDto.fromJson(json['refusalCode']! as Map<String, Object?>),
        reportedErrorCount: json['reportedErrorCount']! as int,
        rowErrors: (json['rowErrors']! as List<Object?>)
            .map((Object? element) => RowErrorViewDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        state: ImportStateDto.fromJson(json['state']! as Map<String, Object?>),
        totalErrorCount: json['totalErrorCount']! as int,
        versions: json['versions'] == null ? null : ProcessingVersionsViewDto.fromJson(json['versions']! as Map<String, Object?>),
      );

  final String accountId;

  final bool awaitsDecision;

  final String? connectionId;

  final ImportCountsViewDto counts;

  final bool hasStoredSource;

  final String importId;

  final PageInfoDto page;

  final ReconciliationStatusDto reconciliationStatus;

  final ImportRefusalCodeDto? refusalCode;

  final int reportedErrorCount;

  final List<RowErrorViewDto> rowErrors;

  final ImportStateDto state;

  final int totalErrorCount;

  final ProcessingVersionsViewDto? versions;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'awaitsDecision': awaitsDecision,
        'connectionId': connectionId,
        'counts': counts.toJson(),
        'hasStoredSource': hasStoredSource,
        'importId': importId,
        'page': page.toJson(),
        'reconciliationStatus': reconciliationStatus.toJson(),
        'refusalCode': refusalCode?.toJson(),
        'reportedErrorCount': reportedErrorCount,
        'rowErrors': rowErrors
            .map((RowErrorViewDto element) => element.toJson())
            .toList(growable: false),
        'state': state.toJson(),
        'totalErrorCount': totalErrorCount,
        'versions': versions?.toJson(),
      };

  @override
  String toString() => 'StatementImportPreviewViewDto()';
}

/// The import's state, without its row errors and without `version` (see the operation's description). Deliberately absent, and to stay absent: the stored source's locator, store kind, byte length, algorithm, key version, nonce, auth tag, integrity checksum and file fingerprint; every staged row and every cell; and the row's `tenantId` and `userId`.
@immutable
final class StatementImportStatusViewDto {
  const StatementImportStatusViewDto({
    required this.accountId,
    required this.awaitsDecision,
    this.connectionId,
    required this.counts,
    required this.hasStoredSource,
    required this.importId,
    required this.reconciliationStatus,
    this.refusalCode,
    required this.reportedErrorCount,
    required this.state,
    required this.totalErrorCount,
    this.versions,
  });

  /// Decodes the contract representation.
  factory StatementImportStatusViewDto.fromJson(Map<String, Object?> json) => StatementImportStatusViewDto(
        accountId: json['accountId']! as String,
        awaitsDecision: json['awaitsDecision']! as bool,
        connectionId: json['connectionId'] as String?,
        counts: ImportCountsViewDto.fromJson(json['counts']! as Map<String, Object?>),
        hasStoredSource: json['hasStoredSource']! as bool,
        importId: json['importId']! as String,
        reconciliationStatus: ReconciliationStatusDto.fromJson(json['reconciliationStatus']! as Map<String, Object?>),
        refusalCode: json['refusalCode'] == null ? null : ImportRefusalCodeDto.fromJson(json['refusalCode']! as Map<String, Object?>),
        reportedErrorCount: json['reportedErrorCount']! as int,
        state: ImportStateDto.fromJson(json['state']! as Map<String, Object?>),
        totalErrorCount: json['totalErrorCount']! as int,
        versions: json['versions'] == null ? null : ProcessingVersionsViewDto.fromJson(json['versions']! as Map<String, Object?>),
      );

  final String accountId;

  final bool awaitsDecision;

  final String? connectionId;

  final ImportCountsViewDto counts;

  final bool hasStoredSource;

  final String importId;

  final ReconciliationStatusDto reconciliationStatus;

  final ImportRefusalCodeDto? refusalCode;

  final int reportedErrorCount;

  final ImportStateDto state;

  final int totalErrorCount;

  final ProcessingVersionsViewDto? versions;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'awaitsDecision': awaitsDecision,
        'connectionId': connectionId,
        'counts': counts.toJson(),
        'hasStoredSource': hasStoredSource,
        'importId': importId,
        'reconciliationStatus': reconciliationStatus.toJson(),
        'refusalCode': refusalCode?.toJson(),
        'reportedErrorCount': reportedErrorCount,
        'state': state.toJson(),
        'totalErrorCount': totalErrorCount,
        'versions': versions?.toJson(),
      };

  @override
  String toString() => 'StatementImportStatusViewDto()';
}

/// USER_FILE_UPLOAD is one of the two rails this platform can actually run.
enum StatementImportViewAvailabilityDto {
  executable('EXECUTABLE'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const StatementImportViewAvailabilityDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static StatementImportViewAvailabilityDto fromWire(String? value) {
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

/// Deliberately absent, and to stay absent: the stored source's locator, store kind, byte length, algorithm, key version, nonce, auth tag, integrity checksum and file fingerprint; every staged row and every cell; the row's `tenantId` and `userId`; and the retention decision's basis, approval reference and pack version, which are internal review artefacts.
@immutable
final class StatementImportViewDto {
  const StatementImportViewDto({
    required this.accountId,
    required this.availability,
    required this.awaitsDecision,
    this.committedAt,
    this.connectionId,
    required this.counts,
    required this.createdAt,
    this.erasedAt,
    required this.hasStoredSource,
    required this.importId,
    required this.mediaType,
    required this.rail,
    required this.reconciliationStatus,
    this.refusalCode,
    required this.retentionState,
    required this.state,
    required this.stateChangedAt,
    this.statedBalance,
    required this.version,
    this.versions,
  });

  /// Decodes the contract representation.
  factory StatementImportViewDto.fromJson(Map<String, Object?> json) => StatementImportViewDto(
        accountId: json['accountId']! as String,
        availability: StatementImportViewAvailabilityDto.fromWire(json['availability']! as String),
        awaitsDecision: json['awaitsDecision']! as bool,
        committedAt: json['committedAt'] == null ? null : DateTime.parse(json['committedAt']! as String).toUtc(),
        connectionId: json['connectionId'] as String?,
        counts: ImportCountsViewDto.fromJson(json['counts']! as Map<String, Object?>),
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        erasedAt: json['erasedAt'] == null ? null : DateTime.parse(json['erasedAt']! as String).toUtc(),
        hasStoredSource: json['hasStoredSource']! as bool,
        importId: json['importId']! as String,
        mediaType: StatementImportViewMediaTypeDto.fromWire(json['mediaType']! as String),
        rail: StatementImportViewRailDto.fromWire(json['rail']! as String),
        reconciliationStatus: ReconciliationStatusDto.fromJson(json['reconciliationStatus']! as Map<String, Object?>),
        refusalCode: json['refusalCode'] == null ? null : ImportRefusalCodeDto.fromJson(json['refusalCode']! as Map<String, Object?>),
        retentionState: StatementImportViewRetentionStateDto.fromWire(json['retentionState']! as String),
        state: ImportStateDto.fromJson(json['state']! as Map<String, Object?>),
        stateChangedAt: DateTime.parse(json['stateChangedAt']! as String).toUtc(),
        statedBalance: json['statedBalance'] == null ? null : StatedStatementBalanceDto.fromJson(json['statedBalance']! as Map<String, Object?>),
        version: json['version']! as int,
        versions: json['versions'] == null ? null : ProcessingVersionsViewDto.fromJson(json['versions']! as Map<String, Object?>),
      );

  final String accountId;

  /// USER_FILE_UPLOAD is one of the two rails this platform can actually run.
  final StatementImportViewAvailabilityDto availability;

  /// Whether this import is waiting for the subject to commit or erase it.
  final bool awaitsDecision;

  final DateTime? committedAt;

  final String? connectionId;

  final ImportCountsViewDto counts;

  final DateTime createdAt;

  final DateTime? erasedAt;

  /// Whether encrypted source bytes exist. EXISTENCE only: a locator is enough to ask a store for somebody's bank statement, so none is carried.
  final bool hasStoredSource;

  final String importId;

  final StatementImportViewMediaTypeDto mediaType;

  /// A statement import is a file the SUBJECT uploaded. It is not a bank connection.
  final StatementImportViewRailDto rail;

  final ReconciliationStatusDto reconciliationStatus;

  final ImportRefusalCodeDto? refusalCode;

  /// Whether an approved retention decision governs this import's durable data. The decision's period, basis, approval reference and pack version stay server-side.
  final StatementImportViewRetentionStateDto retentionState;

  final ImportStateDto state;

  final DateTime stateChangedAt;

  final StatedStatementBalanceDto? statedBalance;

  final int version;

  final ProcessingVersionsViewDto? versions;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'availability': availability.toWire(),
        'awaitsDecision': awaitsDecision,
        'committedAt': committedAt?.toUtc().toIso8601String(),
        'connectionId': connectionId,
        'counts': counts.toJson(),
        'createdAt': createdAt.toUtc().toIso8601String(),
        'erasedAt': erasedAt?.toUtc().toIso8601String(),
        'hasStoredSource': hasStoredSource,
        'importId': importId,
        'mediaType': mediaType.toWire(),
        'rail': rail.toWire(),
        'reconciliationStatus': reconciliationStatus.toJson(),
        'refusalCode': refusalCode?.toJson(),
        'retentionState': retentionState.toWire(),
        'state': state.toJson(),
        'stateChangedAt': stateChangedAt.toUtc().toIso8601String(),
        'statedBalance': statedBalance?.toJson(),
        'version': version,
        'versions': versions?.toJson(),
      };

  @override
  String toString() => 'StatementImportViewDto()';
}

/// Contract enumeration.
enum StatementImportViewMediaTypeDto {
  textCsv('text/csv'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const StatementImportViewMediaTypeDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static StatementImportViewMediaTypeDto fromWire(String? value) {
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

/// A statement import is a file the SUBJECT uploaded. It is not a bank connection.
enum StatementImportViewRailDto {
  userFileUpload('USER_FILE_UPLOAD'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const StatementImportViewRailDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static StatementImportViewRailDto fromWire(String? value) {
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

/// Whether an approved retention decision governs this import's durable data. The decision's period, basis, approval reference and pack version stay server-side.
enum StatementImportViewRetentionStateDto {
  decided('DECIDED'),
  undecided('UNDECIDED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const StatementImportViewRetentionStateDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static StatementImportViewRetentionStateDto fromWire(String? value) {
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

/// Why the platform suggested this pair. One value today, and it is a RULE, not a guess: two amounts equal and opposite, in the same currency, within a stated window.
@immutable
final class SuggestionBasisDto {
  const SuggestionBasisDto();

  /// Decodes the contract representation.
  factory SuggestionBasisDto.fromJson(Map<String, Object?> json) =>
      const SuggestionBasisDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'SuggestionBasisDto()';
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

/// Present only when outcome is PARTIALLY_APPLIED.
enum TransactionDeletionOutcomeViewCodeDto {
  deletionPartiallyApplied('DELETION_PARTIALLY_APPLIED'),
  transferMatchErasureIncomplete('TRANSFER_MATCH_ERASURE_INCOMPLETE'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const TransactionDeletionOutcomeViewCodeDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static TransactionDeletionOutcomeViewCodeDto fromWire(String? value) {
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

/// The result of a delete, complete or partial, in one shape. `outcome` discriminates and `code` is present only when something was left behind. The count is what was really erased.
@immutable
final class TransactionDeletionOutcomeViewDto {
  const TransactionDeletionOutcomeViewDto({
    this.code,
    required this.outcome,
    required this.transactionId,
    required this.transferMatchesDeleted,
  });

  /// Decodes the contract representation.
  factory TransactionDeletionOutcomeViewDto.fromJson(Map<String, Object?> json) => TransactionDeletionOutcomeViewDto(
        code: json['code'] == null ? null : TransactionDeletionOutcomeViewCodeDto.fromWire(json['code']! as String),
        outcome: TransactionDeletionOutcomeViewOutcomeDto.fromWire(json['outcome']! as String),
        transactionId: json['transactionId']! as String,
        transferMatchesDeleted: json['transferMatchesDeleted']! as int,
      );

  /// Present only when outcome is PARTIALLY_APPLIED.
  final TransactionDeletionOutcomeViewCodeDto? code;

  final TransactionDeletionOutcomeViewOutcomeDto outcome;

  final String transactionId;

  final int transferMatchesDeleted;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'code': code?.toWire(),
        'outcome': outcome.toWire(),
        'transactionId': transactionId,
        'transferMatchesDeleted': transferMatchesDeleted,
      };

  @override
  String toString() => 'TransactionDeletionOutcomeViewDto()';
}

/// Contract enumeration.
enum TransactionDeletionOutcomeViewOutcomeDto {
  deleted('DELETED'),
  partiallyApplied('PARTIALLY_APPLIED'),

  /// A value this build does not know.
  ///
  /// The server may add enumeration values at any time; a client that
  /// threw on one would break on a deployment it did not ship with.
  unknown('');

  const TransactionDeletionOutcomeViewOutcomeDto(this.wireValue);

  final String wireValue;

  /// Parses a wire value, falling back to [unknown].
  static TransactionDeletionOutcomeViewOutcomeDto fromWire(String? value) {
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

/// One entry of the append-only history. Revision 1 is what was originally recorded and lists no changed fields. The acting actor reference is deliberately absent: it identifies a principal, and the caller is already the only principal who can read this.
@immutable
final class TransactionRevisionViewDto {
  const TransactionRevisionViewDto({
    required this.attribution,
    required this.changedFields,
    required this.recordedAt,
    required this.revisionNumber,
    required this.values,
  });

  /// Decodes the contract representation.
  factory TransactionRevisionViewDto.fromJson(Map<String, Object?> json) => TransactionRevisionViewDto(
        attribution: RevisionAttributionDto.fromJson(json['attribution']! as Map<String, Object?>),
        changedFields: (json['changedFields']! as List<Object?>)
            .map((Object? element) => RevisableFieldDto.fromJson(element! as Map<String, Object?>))
            .toList(growable: false),
        recordedAt: DateTime.parse(json['recordedAt']! as String).toUtc(),
        revisionNumber: json['revisionNumber']! as int,
        values: RevisionValuesViewDto.fromJson(json['values']! as Map<String, Object?>),
      );

  final RevisionAttributionDto attribution;

  final List<RevisableFieldDto> changedFields;

  final DateTime recordedAt;

  final int revisionNumber;

  final RevisionValuesViewDto values;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'attribution': attribution.toJson(),
        'changedFields': changedFields
            .map((RevisableFieldDto element) => element.toJson())
            .toList(growable: false),
        'recordedAt': recordedAt.toUtc().toIso8601String(),
        'revisionNumber': revisionNumber,
        'values': values.toJson(),
      };

  @override
  String toString() => 'TransactionRevisionViewDto()';
}

/// Contract object.
@immutable
final class TransactionStatusDto {
  const TransactionStatusDto();

  /// Decodes the contract representation.
  factory TransactionStatusDto.fromJson(Map<String, Object?> json) =>
      const TransactionStatusDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'TransactionStatusDto()';
}

/// One of the caller's own transactions. `amount` is SIGNED under the canonical convention and `direction` restates it in words, so a client renders an honest arrow without arithmetic.
/// Deliberately absent, and to stay absent: `tenantId` and `userId`; the dedup fingerprint, its version and the occurrence ordinal; any ciphertext, nonce, auth tag, algorithm or key version; the import reference and the source row reference; and any category confidence.
@immutable
final class TransactionViewDto {
  const TransactionViewDto({
    required this.accountId,
    required this.amount,
    required this.availability,
    required this.bookingDate,
    required this.createdAt,
    required this.description,
    required this.direction,
    this.eventOccurredAt,
    this.merchant,
    this.note,
    this.originalAmount,
    required this.sourceKind,
    this.sourceTimezone,
    required this.status,
    required this.transactionId,
    this.valueDate,
    required this.version,
  });

  /// Decodes the contract representation.
  factory TransactionViewDto.fromJson(Map<String, Object?> json) => TransactionViewDto(
        accountId: json['accountId']! as String,
        amount: MinorUnitAmountDto.fromJson(json['amount']! as Map<String, Object?>),
        availability: RailAvailabilityDto.fromJson(json['availability']! as Map<String, Object?>),
        bookingDate: json['bookingDate']! as String,
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        description: json['description']! as String,
        direction: MoneyDirectionDto.fromJson(json['direction']! as Map<String, Object?>),
        eventOccurredAt: json['eventOccurredAt'] == null ? null : DateTime.parse(json['eventOccurredAt']! as String).toUtc(),
        merchant: json['merchant'] as String?,
        note: json['note'] as String?,
        originalAmount: json['originalAmount'] == null ? null : MinorUnitAmountDto.fromJson(json['originalAmount']! as Map<String, Object?>),
        sourceKind: SourceKindDto.fromJson(json['sourceKind']! as Map<String, Object?>),
        sourceTimezone: json['sourceTimezone'] as String?,
        status: TransactionStatusDto.fromJson(json['status']! as Map<String, Object?>),
        transactionId: json['transactionId']! as String,
        valueDate: json['valueDate'] as String?,
        version: json['version']! as int,
      );

  final String accountId;

  final MinorUnitAmountDto amount;

  final RailAvailabilityDto availability;

  /// The day the institution booked it (ADR-0027).
  final String bookingDate;

  final DateTime createdAt;

  final String description;

  final MoneyDirectionDto direction;

  /// A true instant, present only when the source stated one.
  final DateTime? eventOccurredAt;

  final String? merchant;

  final String? note;

  /// The amount as the source stated it, when its currency differed.
  final MinorUnitAmountDto? originalAmount;

  final SourceKindDto sourceKind;

  final String? sourceTimezone;

  final TransactionStatusDto status;

  final String transactionId;

  final String? valueDate;

  final int version;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountId': accountId,
        'amount': amount.toJson(),
        'availability': availability.toJson(),
        'bookingDate': bookingDate,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'description': description,
        'direction': direction.toJson(),
        'eventOccurredAt': eventOccurredAt?.toUtc().toIso8601String(),
        'merchant': merchant,
        'note': note,
        'originalAmount': originalAmount?.toJson(),
        'sourceKind': sourceKind.toJson(),
        'sourceTimezone': sourceTimezone,
        'status': status.toJson(),
        'transactionId': transactionId,
        'valueDate': valueDate,
        'version': version,
      };

  @override
  String toString() => 'TransactionViewDto()';
}

/// Deliberately absent, and to stay absent: any amount, total, net or converted figure; any exchange rate (cross-currency movements are not matchable, so there is nothing to convert); any confidence or score; any category; and the row's `tenantId` and `userId`.
@immutable
final class TransferMatchViewDto {
  const TransferMatchViewDto({
    required this.authoritative,
    required this.createdAt,
    required this.firstSuggestedAt,
    required this.inflow,
    required this.matchId,
    required this.outflow,
    required this.state,
    this.subjectDecidedAt,
    required this.suggestionBasis,
    required this.suggestionWindow,
    required this.updatedAt,
    required this.version,
  });

  /// Decodes the contract representation.
  factory TransferMatchViewDto.fromJson(Map<String, Object?> json) => TransferMatchViewDto(
        authoritative: json['authoritative']! as bool,
        createdAt: DateTime.parse(json['createdAt']! as String).toUtc(),
        firstSuggestedAt: DateTime.parse(json['firstSuggestedAt']! as String).toUtc(),
        inflow: MatchSideViewDto.fromJson(json['inflow']! as Map<String, Object?>),
        matchId: json['matchId']! as String,
        outflow: MatchSideViewDto.fromJson(json['outflow']! as Map<String, Object?>),
        state: MatchStateDto.fromJson(json['state']! as Map<String, Object?>),
        subjectDecidedAt: json['subjectDecidedAt'] == null ? null : DateTime.parse(json['subjectDecidedAt']! as String).toUtc(),
        suggestionBasis: SuggestionBasisDto.fromJson(json['suggestionBasis']! as Map<String, Object?>),
        suggestionWindow: json['suggestionWindow']! as String,
        updatedAt: DateTime.parse(json['updatedAt']! as String).toUtc(),
        version: json['version']! as int,
      );

  /// True only for CONFIRMED. Stated on the wire so nothing downstream has to decide for itself whether a suggestion counts.
  final bool authoritative;

  final DateTime createdAt;

  final DateTime firstSuggestedAt;

  final MatchSideViewDto inflow;

  final String matchId;

  final MatchSideViewDto outflow;

  final MatchStateDto state;

  /// When the person decided. Null while they have not.
  final DateTime? subjectDecidedAt;

  final SuggestionBasisDto suggestionBasis;

  /// The VERSION LABEL of the rule that produced the suggestion, e.g. `equal-and-opposite/same-currency/P3D/v1`. A person can tell later which rule looked at their data.
  final String suggestionWindow;

  final DateTime updatedAt;

  final int version;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'authoritative': authoritative,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'firstSuggestedAt': firstSuggestedAt.toUtc().toIso8601String(),
        'inflow': inflow.toJson(),
        'matchId': matchId,
        'outflow': outflow.toJson(),
        'state': state.toJson(),
        'subjectDecidedAt': subjectDecidedAt?.toUtc().toIso8601String(),
        'suggestionBasis': suggestionBasis.toJson(),
        'suggestionWindow': suggestionWindow,
        'updatedAt': updatedAt.toUtc().toIso8601String(),
        'version': version,
      };

  @override
  String toString() => 'TransferMatchViewDto()';
}

/// Contract object.
@immutable
final class UpdateOwnFinancialAccountRequestDto {
  const UpdateOwnFinancialAccountRequestDto({
    this.accountType,
    this.currency,
    this.displayName,
    required this.expectedVersion,
    this.institutionId,
    this.mask,
    this.nature,
    this.status,
    this.userSuppliedInstitutionLabel,
    this.walletKind,
  });

  /// Decodes the contract representation.
  factory UpdateOwnFinancialAccountRequestDto.fromJson(Map<String, Object?> json) => UpdateOwnFinancialAccountRequestDto(
        accountType: json['accountType'] == null ? null : AccountTypeDto.fromJson(json['accountType']! as Map<String, Object?>),
        currency: json['currency'] as String?,
        displayName: json['displayName'] as String?,
        expectedVersion: json['expectedVersion']! as int,
        institutionId: json['institutionId'] as String?,
        mask: json['mask'] as String?,
        nature: json['nature'] == null ? null : AccountNatureDto.fromJson(json['nature']! as Map<String, Object?>),
        status: json['status'] == null ? null : AccountStatusDto.fromJson(json['status']! as Map<String, Object?>),
        userSuppliedInstitutionLabel: json['userSuppliedInstitutionLabel'] as String?,
        walletKind: json['walletKind'] == null ? null : WalletKindDto.fromJson(json['walletKind']! as Map<String, Object?>),
      );

  final AccountTypeDto? accountType;

  final String? currency;

  final String? displayName;

  final int expectedVersion;

  final String? institutionId;

  final String? mask;

  final AccountNatureDto? nature;

  final AccountStatusDto? status;

  final String? userSuppliedInstitutionLabel;

  final WalletKindDto? walletKind;

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
        'accountType': accountType?.toJson(),
        'currency': currency,
        'displayName': displayName,
        'expectedVersion': expectedVersion,
        'institutionId': institutionId,
        'mask': mask,
        'nature': nature?.toJson(),
        'status': status?.toJson(),
        'userSuppliedInstitutionLabel': userSuppliedInstitutionLabel,
        'walletKind': walletKind?.toJson(),
      };

  @override
  String toString() => 'UpdateOwnFinancialAccountRequestDto()';
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
final class WalletKindDto {
  const WalletKindDto();

  /// Decodes the contract representation.
  factory WalletKindDto.fromJson(Map<String, Object?> json) =>
      const WalletKindDto();

  /// Encodes the contract representation.
  Map<String, Object?> toJson() => <String, Object?>{
      };

  @override
  String toString() => 'WalletKindDto()';
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
