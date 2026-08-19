// The accounts-and-wallets repository, over the GENERATED client.
//
// Requests are issued by `KararApiClient`, which is generated from the
// contract. No path, no query-parameter name, no body field name and no
// enumeration wire value is written by hand anywhere in this file: each of
// those would be a second reading of a contract that already has one, and a
// second reading is a place for the two to drift apart without anything
// failing.
//
// What IS written by hand is the mapping from the generated DTOs to the domain
// types, and it lives here and nowhere else. Above this file the client deals
// only in the domain, so a contract change is absorbed in one place.
//
// EVERY vocabulary mapping below is an EXHAUSTIVE switch over the generated
// enumeration with no default arm. That is deliberate and it is the regression
// guard: the day the contract gains a member, regeneration adds it to the
// generated enum and this file stops compiling until somebody decides what it
// means. A `Map` lookup with a fallback — which is what this replaced — would
// have compiled happily and quietly answered "unrecognised" forever.
//
// The generated `unknown` member always maps to the domain's `unrecognised`
// and never to a real member: a value this build has not shipped for renders
// as unrecognised rather than as whichever member happened to be first.
import '../../../core/errors/result.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../domain/account_source_link.dart';
import '../domain/balance_snapshot.dart';
import '../domain/calendar_day.dart';
import '../domain/financial_account.dart';
import '../domain/financial_accounts_repository.dart';
import '../domain/page.dart';
import '../domain/safe_mask.dart';
import 'contract_mapping.dart';

/// [FinancialAccountsRepository] over the generated client.
final class ApiFinancialAccountsRepository
    implements FinancialAccountsRepository, IssuerCatalogueRepository {
  const ApiFinancialAccountsRepository(this._client);

  final KararApiClient _client;

  @override
  Future<Result<Page<FinancialAccount>>> listOwnAccounts({
    int? limit,
    String? cursor,
  }) =>
      guarded<Page<FinancialAccount>>('financial.accounts', () async {
        final response = await _client.listOwnFinancialAccounts(
          limit: limit,
          cursor: cursor,
        );
        return pageFrom<FinancialAccount, FinancialAccountViewDto>(
          response.items,
          response.page,
          accountFromDto,
        );
      });

  @override
  Future<Result<FinancialAccount>> readOwnAccount(String accountId) =>
      guarded<FinancialAccount>(
        'financial.accounts.read',
        () async => accountFromDto(
          await _client.readOwnFinancialAccount(accountId: accountId),
        ),
      );

  @override
  Future<Result<FinancialAccount>> createManualAccount(ManualAccountDraft draft) =>
      guarded<FinancialAccount>(
        'financial.accounts.create',
        () async => accountFromDto(
          await _client.createOwnManualFinancialAccount(body: createBodyFor(draft)),
        ),
      );

  @override
  Future<Result<FinancialAccount>> updateAccount(String accountId, AccountEdit edit) =>
      guarded<FinancialAccount>(
        'financial.accounts.update',
        () async => accountFromDto(
          await _client.updateOwnFinancialAccount(
            accountId: accountId,
            body: updateBodyFor(edit),
          ),
        ),
      );

  @override
  Future<Result<Page<BalanceSnapshot>>> listBalances(
    String accountId, {
    int? limit,
    String? cursor,
  }) =>
      guarded<Page<BalanceSnapshot>>('financial.accounts.balances', () async {
        final response = await _client.listOwnAccountBalanceSnapshots(
          accountId: accountId,
          limit: limit,
          cursor: cursor,
        );
        return pageFrom<BalanceSnapshot, BalanceSnapshotViewDto>(
          response.items,
          response.page,
          balanceSnapshotFromDto,
        );
      });

  @override
  Future<Result<Page<AccountSourceLink>>> listSourceLinks(
    String accountId, {
    int? limit,
    String? cursor,
  }) =>
      guarded<Page<AccountSourceLink>>('financial.accounts.sourceLinks', () async {
        final response = await _client.listOwnAccountSourceLinks(
          accountId: accountId,
          limit: limit,
          cursor: cursor,
        );
        return pageFrom<AccountSourceLink, AccountSourceLinkViewDto>(
          response.items,
          response.page,
          sourceLinkFromDto,
        );
      });

  @override
  Future<Result<Page<Issuer>>> listSelectableIssuers({int? limit, String? cursor}) =>
      guarded<Page<Issuer>>('financial.institutions', () async {
        final response = await _client.listFinancialInstitutions(
          limit: limit,
          cursor: cursor,
        );
        return pageFrom<Issuer, InstitutionViewDto>(
          response.items,
          response.page,
          issuerFromDto,
        );
      });
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/// The create body.
///
/// `origin` and `status` are absent because the contract accepts neither:
/// origin is fixed to MANUAL by the use case and status starts ACTIVE. There
/// is therefore no field here through which an EXTERNAL_PROVIDER account could
/// be requested, which is what makes "Connected" unreachable at the point
/// where a record is created rather than only at the point where one is
/// rendered.
///
/// Every optional field is [Omittable]: a field the draft does not name is
/// OMITTED rather than sent as null, because the two are different requests.
CreateOwnManualFinancialAccountRequestDto createBodyFor(ManualAccountDraft draft) {
  final label = draft.unlistedIssuerLabel?.trim();
  final mask = draft.mask?.trim();
  return CreateOwnManualFinancialAccountRequestDto(
    accountType: accountTypeToDto(draft.accountType),
    currency: draft.currencyCode.trim().toUpperCase(),
    displayName: draft.displayName.trim(),
    walletKind: draft.walletKind == null
        ? const Omittable<WalletKindDto>.omitted()
        : Omittable<WalletKindDto>.sent(walletKindToDto(draft.walletKind!)),
    nature: draft.nature == null ? null : accountNatureToDto(draft.nature!),
    institutionId: draft.issuerId == null
        ? const Omittable<String>.omitted()
        : Omittable<String>.sent(draft.issuerId),
    userSuppliedInstitutionLabel: label == null || label.isEmpty
        ? const Omittable<String>.omitted()
        : Omittable<String>.sent(label),
    mask: mask == null || mask.isEmpty
        ? const Omittable<String>.omitted()
        : Omittable<String>.sent(mask),
  );
}

/// The update body.
///
/// A field ABSENT is left alone; a field present as `null` is CLEARED. The two
/// are different requests and the platform does not conflate them, so neither
/// does this: the explicit `clear*` flags are the only way a null reaches the
/// wire, and they reach it as [Omittable.sent] with a null value.
UpdateOwnFinancialAccountRequestDto updateBodyFor(AccountEdit edit) =>
    UpdateOwnFinancialAccountRequestDto(
      expectedVersion: edit.expectedVersion,
      displayName: edit.displayName?.trim(),
      accountType:
          edit.accountType == null ? null : accountTypeToDto(edit.accountType!),
      walletKind: edit.clearWalletKind
          ? const Omittable<WalletKindDto>.sent(null)
          : (edit.walletKind == null
              ? const Omittable<WalletKindDto>.omitted()
              : Omittable<WalletKindDto>.sent(walletKindToDto(edit.walletKind!))),
      nature: edit.nature == null ? null : accountNatureToDto(edit.nature!),
      status: edit.lifecycle == null ? null : accountStatusToDto(edit.lifecycle!),
      mask: edit.clearMask
          ? const Omittable<String>.sent(null)
          : (edit.mask == null
              ? const Omittable<String>.omitted()
              : Omittable<String>.sent(edit.mask)),
      institutionId: edit.clearIssuer
          ? const Omittable<String>.sent(null)
          : (edit.issuerId == null
              ? const Omittable<String>.omitted()
              : Omittable<String>.sent(edit.issuerId)),
      userSuppliedInstitutionLabel: edit.clearIssuer
          ? const Omittable<String>.sent(null)
          : (edit.unlistedIssuerLabel == null
              ? const Omittable<String>.omitted()
              : Omittable<String>.sent(edit.unlistedIssuerLabel!.trim())),
    );

// ---------------------------------------------------------------------------
// Vocabularies, domain → contract
//
// Each switch is exhaustive over the DOMAIN enumeration. `unrecognised` has no
// wire form by construction — it exists only to name a value the platform sent
// that this build does not know — so asking to WRITE one is a client defect
// and is refused before a request leaves, rather than being sent as some
// nearby member.
// ---------------------------------------------------------------------------

AccountTypeDto accountTypeToDto(AccountType type) => switch (type) {
      AccountType.current => AccountTypeDto.current,
      AccountType.savings => AccountTypeDto.savings,
      AccountType.creditCard => AccountTypeDto.creditCard,
      AccountType.cash => AccountTypeDto.cash,
      AccountType.wallet => AccountTypeDto.wallet,
      AccountType.other => AccountTypeDto.other,
      AccountType.unrecognised => throw unwritableVocabularyMember('accountType'),
    };

WalletKindDto walletKindToDto(WalletKind kind) => switch (kind) {
      WalletKind.mobileMoney => WalletKindDto.mobileMoney,
      WalletKind.eMoney => WalletKindDto.eMoney,
      WalletKind.prepaid => WalletKindDto.prepaid,
      WalletKind.payroll => WalletKindDto.payroll,
      WalletKind.superApp => WalletKindDto.superApp,
      WalletKind.other => WalletKindDto.other,
      WalletKind.unrecognised => throw unwritableVocabularyMember('walletKind'),
    };

AccountNatureDto accountNatureToDto(AccountNature nature) => switch (nature) {
      AccountNature.asset => AccountNatureDto.asset,
      AccountNature.liability => AccountNatureDto.liability,
      // The contract DECLARES `UNKNOWN`, so "the subject did not state one" has
      // a wire form and is writable. It is a different member from the
      // generated fallback, which carries no wire value at all.
      AccountNature.notStated => AccountNatureDto.unknown,
      AccountNature.unrecognised => throw unwritableVocabularyMember('nature'),
    };

AccountStatusDto accountStatusToDto(AccountLifecycle lifecycle) =>
    switch (lifecycle) {
      AccountLifecycle.active => AccountStatusDto.active,
      AccountLifecycle.archived => AccountStatusDto.archived,
      AccountLifecycle.closed => AccountStatusDto.closed,
      AccountLifecycle.unrecognised => throw unwritableVocabularyMember('status'),
    };

// ---------------------------------------------------------------------------
// Vocabularies, contract → domain
// ---------------------------------------------------------------------------

AccountType accountTypeFromDto(AccountTypeDto dto) => switch (dto) {
      AccountTypeDto.current => AccountType.current,
      AccountTypeDto.savings => AccountType.savings,
      AccountTypeDto.creditCard => AccountType.creditCard,
      AccountTypeDto.cash => AccountType.cash,
      AccountTypeDto.wallet => AccountType.wallet,
      AccountTypeDto.other => AccountType.other,
      AccountTypeDto.unknown => AccountType.unrecognised,
    };

WalletKind walletKindFromDto(WalletKindDto dto) => switch (dto) {
      WalletKindDto.mobileMoney => WalletKind.mobileMoney,
      WalletKindDto.eMoney => WalletKind.eMoney,
      WalletKindDto.prepaid => WalletKind.prepaid,
      WalletKindDto.payroll => WalletKind.payroll,
      WalletKindDto.superApp => WalletKind.superApp,
      WalletKindDto.other => WalletKind.other,
      WalletKindDto.unknown => WalletKind.unrecognised,
    };

AccountNature accountNatureFromDto(AccountNatureDto dto) => switch (dto) {
      AccountNatureDto.asset => AccountNature.asset,
      AccountNatureDto.liability => AccountNature.liability,
      // The platform's OWN `UNKNOWN`: it answered, and the answer is that
      // nobody stated a nature. That is not the same as a nature this build
      // cannot read, and the two must not collapse — reporting "not stated"
      // for a value the contract added later would present a guess as a fact.
      AccountNatureDto.unknown => AccountNature.notStated,
      AccountNatureDto.unrecognised => AccountNature.unrecognised,
    };

AccountLifecycle accountLifecycleFromDto(AccountStatusDto dto) => switch (dto) {
      AccountStatusDto.active => AccountLifecycle.active,
      AccountStatusDto.archived => AccountLifecycle.archived,
      AccountStatusDto.closed => AccountLifecycle.closed,
      AccountStatusDto.unknown => AccountLifecycle.unrecognised,
    };

AccountOrigin accountOriginFromDto(AccountOriginDto dto) => switch (dto) {
      AccountOriginDto.manual => AccountOrigin.manual,
      AccountOriginDto.csv => AccountOrigin.csv,
      AccountOriginDto.externalProvider => AccountOrigin.externalProvider,
      AccountOriginDto.unknown => AccountOrigin.unrecognised,
    };

IssuerKind issuerKindFromDto(InstitutionKindDto dto) => switch (dto) {
      InstitutionKindDto.bank => IssuerKind.bank,
      InstitutionKindDto.eMoneyIssuer => IssuerKind.eMoneyIssuer,
      InstitutionKindDto.mobileMoneyOperator => IssuerKind.mobileMoneyOperator,
      InstitutionKindDto.telcoFinancialServices => IssuerKind.telcoFinancialServices,
      InstitutionKindDto.paymentInstitution => IssuerKind.paymentInstitution,
      InstitutionKindDto.fintechWallet => IssuerKind.fintechWallet,
      InstitutionKindDto.cardIssuer => IssuerKind.cardIssuer,
      InstitutionKindDto.exchangeHouse => IssuerKind.exchangeHouse,
      InstitutionKindDto.other => IssuerKind.other,
      InstitutionKindDto.unknown => IssuerKind.unrecognised,
    };

IssuerStatus issuerStatusFromDto(InstitutionViewStatusDto dto) => switch (dto) {
      InstitutionViewStatusDto.active => IssuerStatus.active,
      InstitutionViewStatusDto.retired => IssuerStatus.retired,
      InstitutionViewStatusDto.unknown => IssuerStatus.unrecognised,
    };

BalanceKind balanceKindFromDto(BalanceKindDto dto) => switch (dto) {
      BalanceKindDto.booked => BalanceKind.booked,
      BalanceKindDto.available => BalanceKind.available,
      BalanceKindDto.current => BalanceKind.current,
      BalanceKindDto.outstanding => BalanceKind.outstanding,
      BalanceKindDto.creditLimit => BalanceKind.creditLimit,
      BalanceKindDto.otherSourceReported => BalanceKind.otherSourceReported,
      BalanceKindDto.unknown => BalanceKind.unrecognised,
    };

SourceKind sourceKindFromDto(SourceKindDto dto) => switch (dto) {
      SourceKindDto.manual => SourceKind.manual,
      SourceKindDto.csv => SourceKind.csv,
      SourceKindDto.externalProvider => SourceKind.externalProvider,
      SourceKindDto.unknown => SourceKind.unrecognised,
    };

SourceKindDto sourceKindToDto(SourceKind kind) => switch (kind) {
      SourceKind.manual => SourceKindDto.manual,
      SourceKind.csv => SourceKindDto.csv,
      // Present so the mapping is total over the vocabulary. No path in this
      // platform produces a record with this rail, so a filter for it returns
      // nothing — which is the honest answer rather than an error.
      SourceKind.externalProvider => SourceKindDto.externalProvider,
      SourceKind.unrecognised => throw unwritableVocabularyMember('sourceKind'),
    };

RailAvailability railAvailabilityFromDto(RailAvailabilityDto dto) => switch (dto) {
      RailAvailabilityDto.executable => RailAvailability.executable,
      RailAvailabilityDto.notImplemented => RailAvailability.notImplemented,
      RailAvailabilityDto.unknown => RailAvailability.unrecognised,
    };

ConnectionRail connectionRailFromDto(ConnectionRailDto dto) => switch (dto) {
      ConnectionRailDto.manual => ConnectionRail.manual,
      ConnectionRailDto.userFileUpload => ConnectionRail.userFileUpload,
      ConnectionRailDto.openFinanceApi => ConnectionRail.openFinanceApi,
      ConnectionRailDto.directBankOrWalletApi => ConnectionRail.directBankOrWalletApi,
      ConnectionRailDto.licensedAggregatorApi => ConnectionRail.licensedAggregatorApi,
      ConnectionRailDto.hostToHostSftp => ConnectionRail.hostToHostSftp,
      ConnectionRailDto.iso20022File => ConnectionRail.iso20022File,
      ConnectionRailDto.swiftMtFile => ConnectionRail.swiftMtFile,
      ConnectionRailDto.ofxQfxFile => ConnectionRail.ofxQfxFile,
      ConnectionRailDto.qifFile => ConnectionRail.qifFile,
      ConnectionRailDto.pdfStatement => ConnectionRail.pdfStatement,
      ConnectionRailDto.secureEmailStatement => ConnectionRail.secureEmailStatement,
      ConnectionRailDto.deviceSignal => ConnectionRail.deviceSignal,
      ConnectionRailDto.unknown => ConnectionRail.unrecognised,
    };

SourceAuthority sourceAuthorityFromDto(SourceAuthorityDto dto) => switch (dto) {
      SourceAuthorityDto.authoritative => SourceAuthority.authoritative,
      SourceAuthorityDto.supplemental => SourceAuthority.supplemental,
      SourceAuthorityDto.unverified => SourceAuthority.unverified,
      SourceAuthorityDto.unknown => SourceAuthority.unrecognised,
    };

MatchBasis matchBasisFromDto(MatchBasisDto dto) => switch (dto) {
      MatchBasisDto.exactExternalReference => MatchBasis.exactExternalReference,
      MatchBasisDto.probable => MatchBasis.probable,
      MatchBasisDto.unknown => MatchBasis.unrecognised,
    };

SourceLinkStatus sourceLinkStatusFromDto(SourceLinkStatusDto dto) => switch (dto) {
      SourceLinkStatusDto.pendingConfirmation => SourceLinkStatus.pendingConfirmation,
      SourceLinkStatusDto.linked => SourceLinkStatus.linked,
      SourceLinkStatusDto.declined => SourceLinkStatus.declined,
      SourceLinkStatusDto.dormant => SourceLinkStatus.dormant,
      SourceLinkStatusDto.unknown => SourceLinkStatus.unrecognised,
    };

SourceDataObservationState sourceObservationFromDto(
  SourceCapabilityObservationDto dto,
) =>
    switch (dto) {
      SourceCapabilityObservationDto.observed => SourceDataObservationState.observed,
      SourceCapabilityObservationDto.notObserved =>
        SourceDataObservationState.notObserved,
      SourceCapabilityObservationDto.notProvided =>
        SourceDataObservationState.notProvided,
      SourceCapabilityObservationDto.unknown =>
        SourceDataObservationState.unrecognised,
    };

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

/// Whether a reported provider-access token means this platform can reach an
/// issuer. It is `false` for EVERY input, including one this build has never
/// seen, and it is a named function so a test can say so over any value.
///
/// The parameter is deliberately untyped: the contract states the vocabulary
/// three times, once per view, and the answer does not depend on which one
/// arrived or on whether the token is even a member. A `switch` that mapped
/// NOT_IMPLEMENTED to false and defaulted the rest to true is the shape this
/// replaces — a server that ever added a token would have turned the whole
/// surface into a connection claim.
bool providerAccessIsNeverImplemented(Object? reportedStatus) => false;

/// One account or wallet.
FinancialAccount accountFromDto(FinancialAccountViewDto dto) {
  final unlistedLabel = dto.userSuppliedInstitutionLabel;
  return FinancialAccount(
    accountId: dto.accountId,
    displayName: dto.displayName,
    accountType: accountTypeFromDto(dto.accountType),
    walletKind: dto.walletKind == null ? null : walletKindFromDto(dto.walletKind!),
    nature: accountNatureFromDto(dto.nature),
    currency: CurrencyRef(code: dto.currency.code, exponent: dto.currency.exponent),
    mask: SafeMask.from(dto.mask),
    issuer: dto.institution != null
        ? IssuerFromCatalogue(issuerFromDto(dto.institution!))
        : (unlistedLabel != null && unlistedLabel.trim().isNotEmpty
            ? IssuerUnlisted(unlistedLabel)
            : const IssuerNotStated()),
    lifecycle: accountLifecycleFromDto(dto.status),
    origin: accountOriginFromDto(dto.origin),
    link: InstitutionLinkClaim(
      impliesLiveInstitutionLink: dto.link.impliesLiveInstitutionLink,
      // Read so a response omitting it is a contract violation rather than a
      // silent absence, and then discarded: NOT_IMPLEMENTED is the
      // vocabulary's only member, so there is no token this client would read
      // as "implemented". Provider access is false here for every input.
      providerAccessImplemented:
          providerAccessIsNeverImplemented(dto.link.providerAccessStatus),
    ),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    version: dto.version,
  );
}

/// One reviewed catalogue issuer.
Issuer issuerFromDto(InstitutionViewDto dto) => Issuer(
      issuerId: dto.institutionId,
      code: dto.code,
      kind: issuerKindFromDto(dto.kind),
      displayNameEn: dto.displayNameEn,
      displayNameAr: dto.displayNameAr,
      status: issuerStatusFromDto(dto.status),
    );

/// One figure a source reported.
BalanceSnapshot balanceSnapshotFromDto(BalanceSnapshotViewDto dto) => BalanceSnapshot(
      snapshotId: dto.snapshotId,
      accountId: dto.accountId,
      amount: moneyFrom(dto.amount, 'BalanceSnapshotView.amount'),
      balanceKind: balanceKindFromDto(dto.balanceKind),
      sourceKind: sourceKindFromDto(dto.sourceKind),
      availability: railAvailabilityFromDto(dto.availability),
      asOf: dto.asOf,
      capturedAt: dto.capturedAt,
    );

/// One source feeding one account.
AccountSourceLink sourceLinkFromDto(AccountSourceLinkViewDto dto) => AccountSourceLink(
      sourceLinkId: dto.sourceLinkId,
      accountId: dto.accountId,
      connectionId: dto.connectionId,
      rail: connectionRailFromDto(dto.rail),
      availability: railAvailabilityFromDto(dto.availability),
      sourceAuthority: sourceAuthorityFromDto(dto.sourceAuthority),
      matchBasis: matchBasisFromDto(dto.matchBasis),
      status: sourceLinkStatusFromDto(dto.status),
      impliesLiveInstitutionLink: dto.link.impliesLiveInstitutionLink,
      providerAccessImplemented:
          providerAccessIsNeverImplemented(dto.link.providerAccessStatus),
      subjectConfirmedAt: dto.subjectConfirmedAt,
      sourcePriority: dto.sourcePriority,
      observation: SourceObservation(
        firstObservedAt: dto.observation.firstObservedAt,
        lastObservedAt: dto.observation.lastObservedAt,
        lastSuccessfulImportAt: dto.observation.lastSuccessfulImportAt,
      ),
      historyCoverage: dto.historyCoverage == null
          ? null
          : CalendarDayRange(
              start: calendarDayFrom(
                dto.historyCoverage!.start,
                'AccountSourceLinkView.historyCoverage.start',
              ),
              end: calendarDayFrom(
                dto.historyCoverage!.end,
                'AccountSourceLinkView.historyCoverage.end',
              ),
            ),
      capabilities: SourceCapabilities(
        balance: sourceObservationFromDto(dto.capabilities.balance),
        pendingTransactions:
            sourceObservationFromDto(dto.capabilities.pendingTransactions),
      ),
      version: dto.version,
    );
