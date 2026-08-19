// The accounts-and-wallets repository.
//
// DTO → domain mapping lives here and nowhere else. Above this file the client
// deals only in the domain types, so a contract change is absorbed in one
// place — and the vocabularies below are the client's single reading of the
// contract's enumerations.
//
// Nothing is defaulted. Every unknown wire value maps to its vocabulary's
// `unrecognised` member so that a value this build has not shipped for renders
// as unrecognised rather than as whichever member happened to be first.
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/http_method.dart';
import '../domain/account_source_link.dart';
import '../domain/balance_snapshot.dart';
import '../domain/calendar_day.dart';
import '../domain/financial_account.dart';
import '../domain/financial_accounts_repository.dart';
import '../domain/page.dart';
import '../domain/safe_mask.dart';
import 'financial_gateway.dart';
import 'financial_wire.dart';

/// [FinancialAccountsRepository] over the shared transport.
final class ApiFinancialAccountsRepository
    implements FinancialAccountsRepository, IssuerCatalogueRepository {
  const ApiFinancialAccountsRepository(this._gateway);

  final FinancialGateway _gateway;

  @override
  Future<Result<Page<FinancialAccount>>> listOwnAccounts({
    int? limit,
    String? cursor,
  }) =>
      guarded<Page<FinancialAccount>>(
        'financial.accounts',
        () async => decodePage<FinancialAccount>(
          await _gateway.get(
            FinancialPaths.accounts,
            query: <String, Object?>{'limit': limit, 'cursor': cursor},
            location: 'financial.accounts',
          ),
          'financial.accounts',
          decodeAccount,
        ),
      );

  @override
  Future<Result<FinancialAccount>> readOwnAccount(String accountId) =>
      guarded<FinancialAccount>(
        'financial.accounts.read',
        () async => decodeAccount(
          await _gateway.get(
            FinancialPaths.account(accountId),
            location: 'financial.accounts.read',
          ),
        ),
      );

  @override
  Future<Result<FinancialAccount>> createManualAccount(ManualAccountDraft draft) =>
      guarded<FinancialAccount>(
        'financial.accounts.create',
        () async => decodeAccount(
          await _gateway.send(
            HttpMethod.post,
            FinancialPaths.accounts,
            body: _createBody(draft),
            location: 'financial.accounts.create',
          ),
        ),
      );

  @override
  Future<Result<FinancialAccount>> updateAccount(String accountId, AccountEdit edit) =>
      guarded<FinancialAccount>(
        'financial.accounts.update',
        () async => decodeAccount(
          await _gateway.send(
            HttpMethod.patch,
            FinancialPaths.account(accountId),
            body: _updateBody(edit),
            location: 'financial.accounts.update',
          ),
        ),
      );

  @override
  Future<Result<Page<BalanceSnapshot>>> listBalances(
    String accountId, {
    int? limit,
    String? cursor,
  }) =>
      guarded<Page<BalanceSnapshot>>(
        'financial.accounts.balances',
        () async => decodePage<BalanceSnapshot>(
          await _gateway.get(
            FinancialPaths.accountBalances(accountId),
            query: <String, Object?>{'limit': limit, 'cursor': cursor},
            location: 'financial.accounts.balances',
          ),
          'financial.accounts.balances',
          decodeBalanceSnapshot,
        ),
      );

  @override
  Future<Result<Page<AccountSourceLink>>> listSourceLinks(
    String accountId, {
    int? limit,
    String? cursor,
  }) =>
      guarded<Page<AccountSourceLink>>(
        'financial.accounts.sourceLinks',
        () async => decodePage<AccountSourceLink>(
          await _gateway.get(
            FinancialPaths.accountSourceLinks(accountId),
            query: <String, Object?>{'limit': limit, 'cursor': cursor},
            location: 'financial.accounts.sourceLinks',
          ),
          'financial.accounts.sourceLinks',
          decodeSourceLink,
        ),
      );

  @override
  Future<Result<Page<Issuer>>> listSelectableIssuers({int? limit, String? cursor}) =>
      guarded<Page<Issuer>>(
        'financial.institutions',
        () async => decodePage<Issuer>(
          await _gateway.get(
            FinancialPaths.institutions,
            query: <String, Object?>{'limit': limit, 'cursor': cursor},
            location: 'financial.institutions',
          ),
          'financial.institutions',
          decodeIssuer,
        ),
      );

  /// The create body.
  ///
  /// `origin` and `status` are absent because the contract accepts neither:
  /// origin is fixed to MANUAL by the use case and status starts ACTIVE. There
  /// is therefore no field here through which an EXTERNAL_PROVIDER account
  /// could be requested, which is what makes "Connected" unreachable at the
  /// point where a record is created rather than only at the point where one
  /// is rendered.
  static JsonMap _createBody(ManualAccountDraft draft) {
    final label = draft.unlistedIssuerLabel?.trim();
    return <String, Object?>{
      'accountType': accountTypeWire[draft.accountType],
      'currency': draft.currencyCode.trim().toUpperCase(),
      'displayName': draft.displayName.trim(),
      if (draft.walletKind != null) 'walletKind': walletKindWire[draft.walletKind],
      if (draft.nature != null) 'nature': accountNatureWire[draft.nature],
      if (draft.issuerId != null) 'institutionId': draft.issuerId,
      if (label != null && label.isNotEmpty) 'userSuppliedInstitutionLabel': label,
      if (draft.mask != null && draft.mask!.trim().isNotEmpty)
        'mask': draft.mask!.trim(),
    };
  }

  /// The update body.
  ///
  /// A field ABSENT is left alone; a field present as `null` is CLEARED. The
  /// two are different requests and the platform does not conflate them, so
  /// neither does this: the explicit `clear*` flags are the only way a null
  /// reaches the wire.
  static JsonMap _updateBody(AccountEdit edit) => <String, Object?>{
        'expectedVersion': edit.expectedVersion,
        if (edit.displayName != null) 'displayName': edit.displayName!.trim(),
        if (edit.accountType != null) 'accountType': accountTypeWire[edit.accountType],
        if (edit.clearWalletKind)
          'walletKind': null
        else if (edit.walletKind != null)
          'walletKind': walletKindWire[edit.walletKind],
        if (edit.nature != null) 'nature': accountNatureWire[edit.nature],
        if (edit.lifecycle != null) 'status': accountLifecycleWire[edit.lifecycle],
        if (edit.clearMask) 'mask': null else if (edit.mask != null) 'mask': edit.mask,
        if (edit.clearIssuer) ...<String, Object?>{
          'institutionId': null,
          'userSuppliedInstitutionLabel': null,
        } else ...<String, Object?>{
          if (edit.issuerId != null) 'institutionId': edit.issuerId,
          if (edit.unlistedIssuerLabel != null)
            'userSuppliedInstitutionLabel': edit.unlistedIssuerLabel!.trim(),
        },
      };
}

// ---------------------------------------------------------------------------
// Vocabularies. One reading of the contract's enumerations, in both directions.
// ---------------------------------------------------------------------------

const Map<String, AccountType> accountTypeByWire = <String, AccountType>{
  'CURRENT': AccountType.current,
  'SAVINGS': AccountType.savings,
  'CREDIT_CARD': AccountType.creditCard,
  'CASH': AccountType.cash,
  'WALLET': AccountType.wallet,
  'OTHER': AccountType.other,
};

const Map<AccountType, String> accountTypeWire = <AccountType, String>{
  AccountType.current: 'CURRENT',
  AccountType.savings: 'SAVINGS',
  AccountType.creditCard: 'CREDIT_CARD',
  AccountType.cash: 'CASH',
  AccountType.wallet: 'WALLET',
  AccountType.other: 'OTHER',
};

const Map<String, WalletKind> walletKindByWire = <String, WalletKind>{
  'MOBILE_MONEY': WalletKind.mobileMoney,
  'E_MONEY': WalletKind.eMoney,
  'PREPAID': WalletKind.prepaid,
  'PAYROLL': WalletKind.payroll,
  'SUPER_APP': WalletKind.superApp,
  'OTHER': WalletKind.other,
};

const Map<WalletKind, String> walletKindWire = <WalletKind, String>{
  WalletKind.mobileMoney: 'MOBILE_MONEY',
  WalletKind.eMoney: 'E_MONEY',
  WalletKind.prepaid: 'PREPAID',
  WalletKind.payroll: 'PAYROLL',
  WalletKind.superApp: 'SUPER_APP',
  WalletKind.other: 'OTHER',
};

const Map<String, AccountNature> accountNatureByWire = <String, AccountNature>{
  'ASSET': AccountNature.asset,
  'LIABILITY': AccountNature.liability,
  'UNKNOWN': AccountNature.notStated,
};

const Map<AccountNature, String> accountNatureWire = <AccountNature, String>{
  AccountNature.asset: 'ASSET',
  AccountNature.liability: 'LIABILITY',
  AccountNature.notStated: 'UNKNOWN',
};

const Map<String, AccountOrigin> accountOriginByWire = <String, AccountOrigin>{
  'MANUAL': AccountOrigin.manual,
  'CSV': AccountOrigin.csv,
  'EXTERNAL_PROVIDER': AccountOrigin.externalProvider,
};

const Map<String, AccountLifecycle> accountLifecycleByWire = <String, AccountLifecycle>{
  'ACTIVE': AccountLifecycle.active,
  'ARCHIVED': AccountLifecycle.archived,
  'CLOSED': AccountLifecycle.closed,
};

const Map<AccountLifecycle, String> accountLifecycleWire = <AccountLifecycle, String>{
  AccountLifecycle.active: 'ACTIVE',
  AccountLifecycle.archived: 'ARCHIVED',
  AccountLifecycle.closed: 'CLOSED',
};

const Map<String, IssuerKind> issuerKindByWire = <String, IssuerKind>{
  'BANK': IssuerKind.bank,
  'E_MONEY_ISSUER': IssuerKind.eMoneyIssuer,
  'MOBILE_MONEY_OPERATOR': IssuerKind.mobileMoneyOperator,
  'TELCO_FINANCIAL_SERVICES': IssuerKind.telcoFinancialServices,
  'PAYMENT_INSTITUTION': IssuerKind.paymentInstitution,
  'FINTECH_WALLET': IssuerKind.fintechWallet,
  'CARD_ISSUER': IssuerKind.cardIssuer,
  'EXCHANGE_HOUSE': IssuerKind.exchangeHouse,
  'OTHER': IssuerKind.other,
};

const Map<String, IssuerStatus> issuerStatusByWire = <String, IssuerStatus>{
  'ACTIVE': IssuerStatus.active,
  'RETIRED': IssuerStatus.retired,
};

const Map<String, BalanceKind> balanceKindByWire = <String, BalanceKind>{
  'BOOKED': BalanceKind.booked,
  'AVAILABLE': BalanceKind.available,
  'CURRENT': BalanceKind.current,
  'OUTSTANDING': BalanceKind.outstanding,
  'CREDIT_LIMIT': BalanceKind.creditLimit,
  'OTHER_SOURCE_REPORTED': BalanceKind.otherSourceReported,
};

const Map<String, SourceKind> sourceKindByWire = <String, SourceKind>{
  'MANUAL': SourceKind.manual,
  'CSV': SourceKind.csv,
  'EXTERNAL_PROVIDER': SourceKind.externalProvider,
};

const Map<String, RailAvailability> railAvailabilityByWire = <String, RailAvailability>{
  'EXECUTABLE': RailAvailability.executable,
  'NOT_IMPLEMENTED': RailAvailability.notImplemented,
};

const Map<String, ConnectionRail> connectionRailByWire = <String, ConnectionRail>{
  'MANUAL': ConnectionRail.manual,
  'USER_FILE_UPLOAD': ConnectionRail.userFileUpload,
  'OPEN_FINANCE_API': ConnectionRail.openFinanceApi,
  'DIRECT_BANK_OR_WALLET_API': ConnectionRail.directBankOrWalletApi,
  'LICENSED_AGGREGATOR_API': ConnectionRail.licensedAggregatorApi,
  'HOST_TO_HOST_SFTP': ConnectionRail.hostToHostSftp,
  'ISO_20022_FILE': ConnectionRail.iso20022File,
  'SWIFT_MT_FILE': ConnectionRail.swiftMtFile,
  'OFX_QFX_FILE': ConnectionRail.ofxQfxFile,
  'QIF_FILE': ConnectionRail.qifFile,
  'PDF_STATEMENT': ConnectionRail.pdfStatement,
  'SECURE_EMAIL_STATEMENT': ConnectionRail.secureEmailStatement,
  'DEVICE_SIGNAL': ConnectionRail.deviceSignal,
};

const Map<String, SourceAuthority> sourceAuthorityByWire = <String, SourceAuthority>{
  'AUTHORITATIVE': SourceAuthority.authoritative,
  'SUPPLEMENTAL': SourceAuthority.supplemental,
  'UNVERIFIED': SourceAuthority.unverified,
};

const Map<String, MatchBasis> matchBasisByWire = <String, MatchBasis>{
  'EXACT_EXTERNAL_REFERENCE': MatchBasis.exactExternalReference,
  'PROBABLE': MatchBasis.probable,
};

const Map<String, SourceLinkStatus> sourceLinkStatusByWire = <String, SourceLinkStatus>{
  'PENDING_CONFIRMATION': SourceLinkStatus.pendingConfirmation,
  'LINKED': SourceLinkStatus.linked,
  'DECLINED': SourceLinkStatus.declined,
  'DORMANT': SourceLinkStatus.dormant,
};

const Map<String, SourceCapabilityObservation> sourceCapabilityByWire =
    <String, SourceCapabilityObservation>{
  'OBSERVED': SourceCapabilityObservation.observed,
  'NOT_OBSERVED': SourceCapabilityObservation.notObserved,
  'NOT_PROVIDED': SourceCapabilityObservation.notProvided,
};

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

/// Whether a `providerAccessStatus` token means this platform can reach an
/// issuer. It is `false` for every input, including one this build has never
/// seen, and it is a named function so a test can say so over any string.
///
/// A `switch` that mapped NOT_IMPLEMENTED to false and defaulted the rest to
/// true is the shape this replaces: a server that ever added a token would
/// have turned the whole surface into a connection claim.
bool providerAccessIsNeverImplemented(String reportedStatus) => false;

/// One account or wallet.
FinancialAccount decodeAccount(JsonMap json) {
  const at = 'FinancialAccountView';
  final currency = json.object('currency', at);
  final institution = json.objectOrNull('institution', at);
  final unlistedLabel = json.stringOrNull('userSuppliedInstitutionLabel', at);
  final link = json.object('link', at);

  return FinancialAccount(
    accountId: json.string('accountId', at),
    displayName: json.string('displayName', at),
    accountType: decodeEnum<AccountType>(
      json.stringOrNull('accountType', at),
      accountTypeByWire,
      AccountType.unrecognised,
    ),
    walletKind: json['walletKind'] == null
        ? null
        : decodeEnum<WalletKind>(
            json.stringOrNull('walletKind', at),
            walletKindByWire,
            WalletKind.unrecognised,
          ),
    nature: decodeEnum<AccountNature>(
      json.stringOrNull('nature', at),
      accountNatureByWire,
      AccountNature.unrecognised,
    ),
    currency: CurrencyRef(
      code: currency.string('code', '$at.currency'),
      exponent: currency.integer('exponent', '$at.currency'),
    ),
    mask: SafeMask.from(json.stringOrNull('mask', at)),
    issuer: institution != null
        ? IssuerFromCatalogue(decodeIssuer(institution))
        : (unlistedLabel != null && unlistedLabel.trim().isNotEmpty
            ? IssuerUnlisted(unlistedLabel)
            : const IssuerNotStated()),
    lifecycle: decodeEnum<AccountLifecycle>(
      json.stringOrNull('status', at),
      accountLifecycleByWire,
      AccountLifecycle.unrecognised,
    ),
    origin: decodeEnum<AccountOrigin>(
      json.stringOrNull('origin', at),
      accountOriginByWire,
      AccountOrigin.unrecognised,
    ),
    link: InstitutionLinkClaim(
      impliesLiveInstitutionLink: link.boolean('impliesLiveInstitutionLink', '$at.link'),
      // Read so a response omitting it is a contract violation rather than a
      // silent absence, and then discarded: NOT_IMPLEMENTED is the vocabulary's
      // only member, so there is no token this client would read as
      // "implemented". Provider access is false here for every input.
      providerAccessImplemented: providerAccessIsNeverImplemented(
        link.string('providerAccessStatus', '$at.link'),
      ),
    ),
    createdAt: json.instant('createdAt', at),
    updatedAt: json.instant('updatedAt', at),
    version: json.integer('version', at),
  );
}

/// One reviewed catalogue issuer.
Issuer decodeIssuer(JsonMap json) {
  const at = 'InstitutionView';
  return Issuer(
    issuerId: json.string('institutionId', at),
    code: json.string('code', at),
    kind: decodeEnum<IssuerKind>(
      json.stringOrNull('kind', at),
      issuerKindByWire,
      IssuerKind.unrecognised,
    ),
    displayNameEn: json.string('displayNameEn', at),
    displayNameAr: json.string('displayNameAr', at),
    status: decodeEnum<IssuerStatus>(
      json.stringOrNull('status', at),
      issuerStatusByWire,
      IssuerStatus.unrecognised,
    ),
  );
}

/// One figure a source reported.
BalanceSnapshot decodeBalanceSnapshot(JsonMap json) {
  const at = 'BalanceSnapshotView';
  return BalanceSnapshot(
    snapshotId: json.string('snapshotId', at),
    accountId: json.string('accountId', at),
    amount: json.money('amount', at),
    balanceKind: decodeEnum<BalanceKind>(
      json.stringOrNull('balanceKind', at),
      balanceKindByWire,
      BalanceKind.unrecognised,
    ),
    sourceKind: decodeEnum<SourceKind>(
      json.stringOrNull('sourceKind', at),
      sourceKindByWire,
      SourceKind.unrecognised,
    ),
    availability: decodeEnum<RailAvailability>(
      json.stringOrNull('availability', at),
      railAvailabilityByWire,
      RailAvailability.unrecognised,
    ),
    asOf: json.instant('asOf', at),
    capturedAt: json.instant('capturedAt', at),
  );
}

/// One source feeding one account.
AccountSourceLink decodeSourceLink(JsonMap json) {
  const at = 'AccountSourceLinkView';
  final link = json.object('link', at);
  final observation = json.object('observation', at);
  final capabilities = json.object('capabilities', at);
  final coverage = json.objectOrNull('historyCoverage', at);

  return AccountSourceLink(
    sourceLinkId: json.string('sourceLinkId', at),
    accountId: json.string('accountId', at),
    connectionId: json.string('connectionId', at),
    rail: decodeEnum<ConnectionRail>(
      json.stringOrNull('rail', at),
      connectionRailByWire,
      ConnectionRail.unrecognised,
    ),
    availability: decodeEnum<RailAvailability>(
      json.stringOrNull('availability', at),
      railAvailabilityByWire,
      RailAvailability.unrecognised,
    ),
    sourceAuthority: decodeEnum<SourceAuthority>(
      json.stringOrNull('sourceAuthority', at),
      sourceAuthorityByWire,
      SourceAuthority.unrecognised,
    ),
    matchBasis: decodeEnum<MatchBasis>(
      json.stringOrNull('matchBasis', at),
      matchBasisByWire,
      MatchBasis.unrecognised,
    ),
    status: decodeEnum<SourceLinkStatus>(
      json.stringOrNull('status', at),
      sourceLinkStatusByWire,
      SourceLinkStatus.unrecognised,
    ),
    impliesLiveInstitutionLink:
        link.boolean('impliesLiveInstitutionLink', '$at.link'),
    providerAccessImplemented: false,
    subjectConfirmedAt: json.instantOrNull('subjectConfirmedAt', at),
    sourcePriority: json.integer('sourcePriority', at),
    observation: SourceObservation(
      firstObservedAt: observation.instant('firstObservedAt', '$at.observation'),
      lastObservedAt: observation.instant('lastObservedAt', '$at.observation'),
      lastSuccessfulImportAt:
          observation.instantOrNull('lastSuccessfulImportAt', '$at.observation'),
    ),
    historyCoverage: coverage == null
        ? null
        : CalendarDayRange(
            start: coverage.calendarDay('start', '$at.historyCoverage'),
            end: coverage.calendarDay('end', '$at.historyCoverage'),
          ),
    capabilities: SourceCapabilities(
      balance: decodeEnum<SourceCapabilityObservation>(
        capabilities.stringOrNull('balance', '$at.capabilities'),
        sourceCapabilityByWire,
        SourceCapabilityObservation.unrecognised,
      ),
      pendingTransactions: decodeEnum<SourceCapabilityObservation>(
        capabilities.stringOrNull('pendingTransactions', '$at.capabilities'),
        sourceCapabilityByWire,
        SourceCapabilityObservation.unrecognised,
      ),
    ),
    version: json.integer('version', at),
  );
}
