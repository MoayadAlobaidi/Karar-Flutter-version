// EVERY VOCABULARY, TURNED INTO TRANSLATED COPY IN ONE PLACE.
//
// Each switch is exhaustive over its enum, so adding a member to a vocabulary
// stops the build here until somebody writes the two translations for it. That
// is deliberate: the alternative is a `default` arm, and a default arm is how a
// value nobody has translated ends up rendered as whichever label happened to
// be nearest.
//
// The `unrecognised` member of every vocabulary has its OWN copy. It never
// borrows the label of a real member — a status the client does not understand
// must not be shown as one it does.
import '../../../l10n/karar_localization.dart';
import '../domain/account_portfolio.dart';
import '../domain/account_source_link.dart';
import '../domain/balance_snapshot.dart';
import '../domain/data_origin.dart';
import '../domain/financial_account.dart';


String accountTypeLabel(AccountType type, AppLocalizations l10n) => switch (type) {
      AccountType.current => l10n.accountTypeCurrent,
      AccountType.savings => l10n.accountTypeSavings,
      AccountType.creditCard => l10n.accountTypeCreditCard,
      AccountType.cash => l10n.accountTypeCash,
      AccountType.wallet => l10n.accountTypeWallet,
      AccountType.other => l10n.accountTypeOther,
      AccountType.unrecognised => l10n.accountTypeUnrecognised,
    };

String walletKindLabel(WalletKind? kind, AppLocalizations l10n) => switch (kind) {
      null => l10n.walletKindNone,
      WalletKind.mobileMoney => l10n.walletKindMobileMoney,
      WalletKind.eMoney => l10n.walletKindEMoney,
      WalletKind.prepaid => l10n.walletKindPrepaid,
      WalletKind.payroll => l10n.walletKindPayroll,
      WalletKind.superApp => l10n.walletKindSuperApp,
      WalletKind.other => l10n.walletKindOther,
      WalletKind.unrecognised => l10n.walletKindUnrecognised,
    };

String accountNatureLabel(AccountNature nature, AppLocalizations l10n) =>
    switch (nature) {
      AccountNature.asset => l10n.accountNatureAsset,
      AccountNature.liability => l10n.accountNatureLiability,
      AccountNature.notStated => l10n.accountNatureNotStated,
      AccountNature.unrecognised => l10n.accountNatureUnrecognised,
    };

String accountLifecycleLabel(AccountLifecycle lifecycle, AppLocalizations l10n) =>
    switch (lifecycle) {
      AccountLifecycle.active => l10n.accountLifecycleActive,
      AccountLifecycle.archived => l10n.accountLifecycleArchived,
      AccountLifecycle.closed => l10n.accountLifecycleClosed,
      AccountLifecycle.unrecognised => l10n.accountLifecycleUnrecognised,
    };

String issuerKindLabel(IssuerKind? kind, AppLocalizations l10n) => switch (kind) {
      null => l10n.issuerKindNone,
      IssuerKind.bank => l10n.issuerKindBank,
      IssuerKind.eMoneyIssuer => l10n.issuerKindEMoneyIssuer,
      IssuerKind.mobileMoneyOperator => l10n.issuerKindMobileMoneyOperator,
      IssuerKind.telcoFinancialServices => l10n.issuerKindTelcoFinancialServices,
      IssuerKind.paymentInstitution => l10n.issuerKindPaymentInstitution,
      IssuerKind.fintechWallet => l10n.issuerKindFintechWallet,
      IssuerKind.cardIssuer => l10n.issuerKindCardIssuer,
      IssuerKind.exchangeHouse => l10n.issuerKindExchangeHouse,
      IssuerKind.other => l10n.issuerKindOther,
      IssuerKind.unrecognised => l10n.issuerKindUnrecognised,
    };

/// The issuer's name in the reading language.
///
/// The catalogue ships both names as reference data, so the client picks by
/// locale rather than translating anything itself.
String issuerDisplayName(Issuer issuer, AppLocalizations l10n) =>
    l10n.localeName == 'ar' ? issuer.displayNameAr : issuer.displayNameEn;

/// The heading for whichever issuer an account names.
String issuerAttributionLabel(IssuerAttribution issuer, AppLocalizations l10n) =>
    switch (issuer) {
      IssuerFromCatalogue(:final issuer) => issuerDisplayName(issuer, l10n),
      IssuerUnlisted(:final label) => label,
      IssuerNotStated() => l10n.issuerNotStated,
    };

String balanceKindLabel(BalanceKind kind, AppLocalizations l10n) => switch (kind) {
      BalanceKind.booked => l10n.balanceKindBooked,
      BalanceKind.available => l10n.balanceKindAvailable,
      BalanceKind.current => l10n.balanceKindCurrent,
      BalanceKind.outstanding => l10n.balanceKindOutstanding,
      BalanceKind.creditLimit => l10n.balanceKindCreditLimit,
      BalanceKind.otherSourceReported => l10n.balanceKindOtherSourceReported,
      BalanceKind.unrecognised => l10n.balanceKindUnrecognised,
    };

/// The one and only source label.
///
/// There is no arm here that says "connected", "synced" or "linked", and there
/// is no ARB message that would let one be written: see
/// `domain/data_origin.dart`.
String dataOriginLabel(DataOrigin origin, AppLocalizations l10n) => switch (origin) {
      DataOrigin.manuallyAdded => l10n.dataOriginManuallyAdded,
      DataOrigin.importedFromStatement => l10n.dataOriginImportedFromStatement,
      DataOrigin.fileImportOnly => l10n.dataOriginFileImportOnly,
      DataOrigin.notStated => l10n.dataOriginNotStated,
    };

/// The source label for an account, derived from its origin alone.
String accountOriginLabel(AccountOrigin origin, AppLocalizations l10n) =>
    dataOriginLabel(dataOriginOfAccount(origin), l10n);

/// The source label for a stored figure or record, derived from its rail and
/// that rail's availability.
String sourceKindLabel(
  SourceKind kind,
  RailAvailability availability,
  AppLocalizations l10n,
) =>
    dataOriginLabel(dataOriginOfSourceKind(kind, availability), l10n);

String sourceLinkStatusLabel(SourceLinkStatus status, AppLocalizations l10n) =>
    switch (status) {
      SourceLinkStatus.pendingConfirmation => l10n.sourceStatusPendingConfirmation,
      // "Attached to this account", never "connected": LINKED describes a
      // relationship inside this platform, not one with an institution.
      SourceLinkStatus.linked => l10n.sourceStatusAttached,
      SourceLinkStatus.declined => l10n.sourceStatusDeclined,
      SourceLinkStatus.dormant => l10n.sourceStatusDormant,
      SourceLinkStatus.unrecognised => l10n.sourceStatusUnrecognised,
    };

String sourceAuthorityLabel(SourceAuthority authority, AppLocalizations l10n) =>
    switch (authority) {
      SourceAuthority.authoritative => l10n.sourceAuthorityAuthoritative,
      SourceAuthority.supplemental => l10n.sourceAuthoritySupplemental,
      SourceAuthority.unverified => l10n.sourceAuthorityUnverified,
      SourceAuthority.unrecognised => l10n.sourceAuthorityUnrecognised,
    };

String sourceObservationLabel(
  SourceCapabilityObservation observation,
  AppLocalizations l10n,
) =>
    switch (observation) {
      SourceCapabilityObservation.observed => l10n.sourceObservationObserved,
      SourceCapabilityObservation.notObserved => l10n.sourceObservationNotObserved,
      SourceCapabilityObservation.notProvided => l10n.sourceObservationNotProvided,
      SourceCapabilityObservation.unrecognised => l10n.sourceObservationUnrecognised,
    };

String portfolioGroupingLabel(PortfolioGrouping grouping, AppLocalizations l10n) =>
    switch (grouping) {
      PortfolioGrouping.issuer => l10n.groupByIssuer,
      PortfolioGrouping.issuerKind => l10n.groupByIssuerKind,
      PortfolioGrouping.accountType => l10n.groupByAccountType,
      PortfolioGrouping.walletKind => l10n.groupByWalletKind,
      PortfolioGrouping.nature => l10n.groupByNature,
      PortfolioGrouping.currency => l10n.groupByCurrency,
      PortfolioGrouping.lifecycle => l10n.groupByLifecycle,
      PortfolioGrouping.origin => l10n.groupByOrigin,
    };

/// The heading for one group, whichever axis produced it.
String portfolioGroupHeading(PortfolioGroupKey key, AppLocalizations l10n) {
  final issuer = key.issuer;
  if (issuer != null) {
    return issuerDisplayName(issuer, l10n);
  }
  final unlisted = key.unlistedIssuerLabel;
  if (unlisted != null) {
    return unlisted;
  }
  if (key.identifier.startsWith('issuerKind:')) {
    return issuerKindLabel(key.issuerKind, l10n);
  }
  final accountType = key.accountType;
  if (accountType != null) {
    return accountTypeLabel(accountType, l10n);
  }
  if (key.identifier.startsWith('walletKind:')) {
    return walletKindLabel(key.walletKind, l10n);
  }
  final nature = key.nature;
  if (nature != null) {
    return accountNatureLabel(nature, l10n);
  }
  final currency = key.currencyCode;
  if (currency != null) {
    return currency;
  }
  final lifecycle = key.lifecycle;
  if (lifecycle != null) {
    return accountLifecycleLabel(lifecycle, l10n);
  }
  final origin = key.origin;
  if (origin != null) {
    return accountOriginLabel(origin, l10n);
  }
  return l10n.issuerNotStated;
}

/// The copy for the mask of an account or instrument.
String safeMaskLabel(String? value, {required bool withheld, required AppLocalizations l10n}) {
  if (withheld) {
    return l10n.accountMaskWithheld;
  }
  return value ?? l10n.accountMaskAbsent;
}
