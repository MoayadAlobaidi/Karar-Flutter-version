// FIXTURES FOR THE FINANCIAL SURFACE.
//
// EVERY ISSUER, ACCOUNT, WALLET AND CARD HERE IS SYNTHETIC. No real bank,
// telco, card scheme or wallet provider is named anywhere in this workstream's
// tests: a fixture is where a real institution's name gets written down first
// and quoted as a supported integration later.
//
// The identifiers are obviously fake and the figures are obviously round. The
// point of the amounts is their SHAPE — two currencies that must not be added,
// a wallet that holds one balance while two cards spend from it, a liability
// that is negative — and never their value.
//
// The bootstrap fixture is a LOCAL/TEST answer built in the test process. It
// never touches real capability state: `navigableCapabilityIds` stays empty and
// nothing here writes to a store.
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/calendar_day.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/money.dart';
import 'package:karar_mobile/features/financial_accounts/domain/safe_mask.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_capability.dart';
import 'package:karar_mobile/features/payment_instruments/domain/payment_instrument.dart';
import 'package:karar_mobile/features/transaction_categories/domain/transaction_category.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';

// ---------------------------------------------------------------------------
// Synthetic identifiers and names
// ---------------------------------------------------------------------------

const String issuerOneId = 'issuer-0001';
const String issuerTwoId = 'issuer-0002';
const String issuerWalletId = 'issuer-0003';

/// Deliberately invented names. A test that named a real institution would be
/// the first place somebody read this product as integrating with one.
const String issuerOneNameEn = 'First Reviewed Issuer';
const String issuerOneNameAr = 'الجهة المُراجَعة الأولى';
const String issuerTwoNameEn = 'Second Reviewed Issuer';
const String issuerTwoNameAr = 'الجهة المُراجَعة الثانية';
const String issuerWalletNameEn = 'Reviewed Wallet Issuer';
const String issuerWalletNameAr = 'جهة المحافظ المُراجَعة';
const String unlistedIssuerLabel = 'Issuer Entered By Hand';

/// A long name, so a test can prove nothing clips at 2x text scale.
const String longIssuerNameEn =
    'Reviewed Issuer With A Very Long Registered Name For Layout Verification';
const String longAccountName =
    'Everyday account with an unusually long name a person typed themselves';

Issuer issuerOne({IssuerKind kind = IssuerKind.bank, IssuerStatus status = IssuerStatus.active}) =>
    Issuer(
      issuerId: issuerOneId,
      code: 'ISSUER_ONE',
      kind: kind,
      displayNameEn: issuerOneNameEn,
      displayNameAr: issuerOneNameAr,
      status: status,
    );

Issuer issuerTwo({IssuerKind kind = IssuerKind.exchangeHouse}) => Issuer(
      issuerId: issuerTwoId,
      code: 'ISSUER_TWO',
      kind: kind,
      displayNameEn: issuerTwoNameEn,
      displayNameAr: issuerTwoNameAr,
      status: IssuerStatus.active,
    );

Issuer walletIssuer() => Issuer(
      issuerId: issuerWalletId,
      code: 'ISSUER_WALLET',
      kind: IssuerKind.fintechWallet,
      displayNameEn: issuerWalletNameEn,
      displayNameAr: issuerWalletNameAr,
      status: IssuerStatus.active,
    );

const InstitutionLinkClaim noLiveLink = InstitutionLinkClaim(
  impliesLiveInstitutionLink: false,
  providerAccessImplemented: false,
);

FinancialAccount account({
  required String accountId,
  String displayName = 'Account',
  AccountType accountType = AccountType.current,
  WalletKind? walletKind,
  AccountNature nature = AccountNature.asset,
  String currency = 'QAR',
  int exponent = 2,
  String? mask = '**1234',
  IssuerAttribution? issuer,
  AccountLifecycle lifecycle = AccountLifecycle.active,
  AccountOrigin origin = AccountOrigin.manual,
  int version = 1,
}) =>
    FinancialAccount(
      accountId: accountId,
      displayName: displayName,
      accountType: accountType,
      walletKind: walletKind,
      nature: nature,
      currency: CurrencyRef(code: currency, exponent: exponent),
      mask: SafeMask.from(mask),
      issuer: issuer ?? IssuerFromCatalogue(issuerOne()),
      lifecycle: lifecycle,
      origin: origin,
      link: noLiveLink,
      createdAt: DateTime.utc(2026),
      updatedAt: DateTime.utc(2026, 2),
      version: version,
    );

/// A portfolio that exercises every multiplicity the brief names.
///
///   * three issuers, one of them unlisted and one absent entirely;
///   * two accounts at one issuer of the SAME type and the SAME currency,
///     which must stay two rows;
///   * two currencies, which must never be added together;
///   * two wallets from one issuer, with different wallet kinds;
///   * cash, and an account imported from a statement.
List<FinancialAccount> wholePortfolio() => <FinancialAccount>[
      account(
        accountId: 'account-0001',
        displayName: 'Everyday account',
        currency: 'QAR',
      ),
      // Same issuer, same type, same currency as the row above. Two accounts,
      // not one.
      account(
        accountId: 'account-0002',
        displayName: 'Second everyday account',
        currency: 'QAR',
      ),
      account(
        accountId: 'account-0003',
        displayName: 'Savings in another currency',
        accountType: AccountType.savings,
        currency: 'USD',
      ),
      account(
        accountId: 'account-0004',
        displayName: 'Card account',
        accountType: AccountType.creditCard,
        nature: AccountNature.liability,
        issuer: IssuerFromCatalogue(issuerTwo()),
        origin: AccountOrigin.csv,
      ),
      account(
        accountId: 'account-0005',
        displayName: 'First wallet',
        accountType: AccountType.wallet,
        walletKind: WalletKind.mobileMoney,
        issuer: IssuerFromCatalogue(walletIssuer()),
      ),
      // A second wallet at the SAME issuer, of a different kind.
      account(
        accountId: 'account-0006',
        displayName: 'Second wallet',
        accountType: AccountType.wallet,
        walletKind: WalletKind.prepaid,
        issuer: IssuerFromCatalogue(walletIssuer()),
      ),
      account(
        accountId: 'account-0007',
        displayName: 'Cash at home',
        accountType: AccountType.cash,
        issuer: const IssuerNotStated(),
        mask: null,
      ),
      account(
        accountId: 'account-0008',
        displayName: 'Account at an unlisted issuer',
        issuer: const IssuerUnlisted(unlistedIssuerLabel),
        lifecycle: AccountLifecycle.archived,
      ),
    ];

Money money(String minorUnits, {String currency = 'QAR', int exponent = 2}) =>
    Money(minorUnits: minorUnits, currency: currency, exponent: exponent);

BalanceSnapshot balance({
  String snapshotId = 'snapshot-0001',
  String accountId = 'account-0001',
  Money? amount,
  BalanceKind balanceKind = BalanceKind.booked,
  SourceKind sourceKind = SourceKind.manual,
  RailAvailability availability = RailAvailability.executable,
  DateTime? asOf,
}) =>
    BalanceSnapshot(
      snapshotId: snapshotId,
      accountId: accountId,
      amount: amount ?? money('125000'),
      balanceKind: balanceKind,
      sourceKind: sourceKind,
      availability: availability,
      asOf: asOf ?? DateTime.utc(2026, 3, 1, 12),
      capturedAt: DateTime.utc(2026, 3, 1, 13),
    );

AccountSourceLink sourceLink({
  String sourceLinkId = 'source-link-0001',
  String accountId = 'account-0001',
  ConnectionRail rail = ConnectionRail.userFileUpload,
  RailAvailability availability = RailAvailability.executable,
  SourceLinkStatus status = SourceLinkStatus.linked,
  DateTime? lastSuccessfulImportAt,
  CalendarDayRange? coverage,
}) =>
    AccountSourceLink(
      sourceLinkId: sourceLinkId,
      accountId: accountId,
      connectionId: 'connection-0001',
      rail: rail,
      availability: availability,
      sourceAuthority: SourceAuthority.authoritative,
      matchBasis: MatchBasis.exactExternalReference,
      status: status,
      impliesLiveInstitutionLink: false,
      providerAccessImplemented: false,
      subjectConfirmedAt: DateTime.utc(2026, 2, 2),
      sourcePriority: 1,
      observation: SourceObservation(
        firstObservedAt: DateTime.utc(2026),
        lastObservedAt: DateTime.utc(2026, 3),
        lastSuccessfulImportAt: lastSuccessfulImportAt,
      ),
      historyCoverage: coverage,
      capabilities: const SourceCapabilities(
        balance: SourceDataObservationState.observed,
        pendingTransactions: SourceDataObservationState.notProvided,
      ),
      version: 1,
    );

PaymentInstrument instrument({
  required String instrumentId,
  String accountId = 'account-0005',
  String displayLabel = 'Card',
  InstrumentType instrumentType = InstrumentType.virtualCard,
  InstrumentStatus status = InstrumentStatus.active,
  bool spendable = true,
  String mask = '**4321',
}) =>
    PaymentInstrument(
      instrumentId: instrumentId,
      accountId: accountId,
      instrumentType: instrumentType,
      status: status,
      spendable: spendable,
      mask: SafeMask.from(mask),
      displayLabel: displayLabel,
      impliesLiveIssuerLink: false,
      version: 1,
      createdAt: DateTime.utc(2026),
      updatedAt: DateTime.utc(2026),
    );

Transaction transaction({
  String transactionId = 'transaction-0001',
  String accountId = 'account-0001',
  Money? amount,
  MoneyDirection direction = MoneyDirection.moneyOut,
  CalendarDay? bookingDate,
  CalendarDay? valueDate,
  String description = 'Recorded movement',
  String? merchant,
  String? note,
  Money? originalAmount,
  SourceKind sourceKind = SourceKind.manual,
  RailAvailability availability = RailAvailability.executable,
  TransactionStatus status = TransactionStatus.posted,
  int version = 1,
}) =>
    Transaction(
      transactionId: transactionId,
      accountId: accountId,
      amount: amount ?? money('-4500'),
      direction: direction,
      bookingDate: bookingDate ?? const CalendarDay(year: 2026, month: 3, day: 1),
      valueDate: valueDate,
      eventOccurredAt: null,
      sourceTimezone: null,
      merchant: merchant,
      description: description,
      note: note,
      originalAmount: originalAmount,
      sourceKind: sourceKind,
      availability: availability,
      status: status,
      createdAt: DateTime.utc(2026, 3, 2),
      version: version,
    );

TransactionDetail transactionDetail({
  Transaction? held,
  CategoryAssignment? activeCategory,
  bool divergesFromSource = false,
  List<TransactionRevision>? revisions,
}) {
  final subject = held ?? transaction();
  return TransactionDetail(
    transaction: subject,
    revisions: revisions ??
        <TransactionRevision>[
          TransactionRevision(
            revisionNumber: 1,
            attribution: RevisionAttribution.manualEntry,
            changedFields: const <RevisableField>[],
            values: RevisionValues(
              amount: subject.amount,
              direction: subject.direction,
              bookingDate: subject.bookingDate,
              valueDate: subject.valueDate,
              eventOccurredAt: null,
              sourceTimezone: null,
              merchant: subject.merchant,
              description: subject.description,
              note: subject.note,
              status: subject.status,
            ),
            recordedAt: DateTime.utc(2026, 3, 2),
          ),
        ],
    activeCategory: activeCategory,
    divergesFromSource: divergesFromSource,
  );
}

CategoryAssignment categoryAssignment({
  String categoryCode = 'HOUSEHOLD',
  AssignmentSource assignmentSource = AssignmentSource.user,
  String? ruleVersion,
}) =>
    CategoryAssignment(
      assignmentId: 'assignment-0001',
      categoryCode: categoryCode,
      assignmentSource: assignmentSource,
      ruleVersion: ruleVersion,
      status: AssignmentStatus.active,
      assignedAt: DateTime.utc(2026, 3, 3),
    );

TransactionProvenance provenance({
  int revisionNumber = 1,
  SourceKind sourceKind = SourceKind.csv,
  RailAvailability availability = RailAvailability.executable,
  bool importedFromStatement = true,
}) =>
    TransactionProvenance(
      revisionNumber: revisionNumber,
      sourceKind: sourceKind,
      availability: availability,
      accountId: 'account-0001',
      importedFromStatement: importedFromStatement,
      versions: const ProcessingVersions(
        parserVersion: 'parser-1',
        mappingVersion: 'mapping-1',
        normalizationVersion: 'normalization-1',
        // An ALGORITHM version. Never a fingerprint.
        fingerprintVersion: 'fingerprint-algorithm-1',
      ),
      sourceDirection: SourceDirection.debit,
      directionMapping: DirectionMapping.sourceDirectionWord,
      categoryAssignmentSource: CategoryAssignmentOrigin.user,
      createdAt: DateTime.utc(2026, 3, 2),
    );

CategoryCatalogue catalogue() => const CategoryCatalogue(<TransactionCategory>[
      TransactionCategory(
        code: 'HOUSEHOLD',
        parentCode: null,
        labelEn: 'Household',
        labelAr: 'المنزل',
        catalogueVersion: 'catalogue-1',
        assignable: true,
        retiredAt: null,
      ),
      TransactionCategory(
        code: 'HOUSEHOLD.UTILITIES',
        parentCode: 'HOUSEHOLD',
        labelEn: 'Utilities',
        labelAr: 'المرافق',
        catalogueVersion: 'catalogue-1',
        assignable: true,
        retiredAt: null,
      ),
      TransactionCategory(
        code: 'RETIRED_ENTRY',
        parentCode: null,
        labelEn: 'Retired entry',
        labelAr: 'مدخل متقاعد',
        catalogueVersion: 'catalogue-1',
        assignable: false,
        retiredAt: null,
      ),
    ]);

// ---------------------------------------------------------------------------
// The capability answer
// ---------------------------------------------------------------------------

/// A clearly synthetic LOCAL/TEST bootstrap answer.
///
/// It is built in the test process out of literals; nothing here reads or
/// writes real capability state, and the platform's own navigable allowlist
/// stays empty and untouched.
BootstrapSnapshot syntheticBootstrap({
  bool withTransactions = true,
  CapabilityResolutionState resolution = CapabilityResolutionState.resolved,
  String status = 'AVAILABLE',
}) =>
    BootstrapSnapshot(
      userId: 'local-test-user',
      emailVerified: true,
      sessionId: 'local-test-session',
      binding: const TenantBound(
        TenantOption(
          tenantId: 'local-test-tenant',
          name: 'Local Test Organisation',
          roleHint: 'MEMBER',
        ),
      ),
      jurisdictionState: JurisdictionState.verified,
      jurisdictionId: 'local-test-jurisdiction',
      operatingEntityState: OperatingEntityState.assigned,
      operatingEntity: const OperatingEntitySummary(
        id: 'local-test-entity',
        name: 'Local Test Operating Entity',
        jurisdictionRef: 'local-test-jurisdiction',
        contactReference: 'privacy@example.invalid',
      ),
      policyPackVersion: '1.0.0',
      policyPackStatus: 'ACTIVE',
      capabilityState: resolution,
      capabilities: <CapabilityView>[
        if (withTransactions)
          CapabilityView(
            id: transactionsCapabilityId,
            status: status,
            requirements: const <String>[],
          ),
      ],
    );
