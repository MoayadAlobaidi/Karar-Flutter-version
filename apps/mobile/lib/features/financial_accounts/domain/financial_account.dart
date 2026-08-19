// PURE DART ONLY. See lib/README.md — domain purity.
//
// THE CALLER'S OWN ACCOUNTS AND WALLETS.
//
// One type covers a current account, a savings account, a credit card
// account, cash, and a wallet, because the platform models them as one thing
// that holds a balance in one currency. What spends FROM an account — a card,
// a QR identity — is a payment instrument and lives in its own feature; it has
// no balance and never acquires one here.
//
// Every vocabulary below carries an `unrecognised` member. Unrecognised is not
// a synonym for a convenient default: an account whose type this build does
// not know renders as unrecognised rather than as "Other", because "Other" is
// a claim about what the platform said.
//
// DELIBERATELY ABSENT, and to stay absent: any balance (a balance is a
// reported fact with its own route, and a figure here would be a second number
// free to disagree with it), any external account reference, any fingerprint,
// any ciphertext or key material, and any notion of a live institution link.
import 'package:meta/meta.dart';

import 'safe_mask.dart';

/// What the account IS.
enum AccountType { current, savings, creditCard, cash, wallet, other, unrecognised }

/// What kind of wallet, for a WALLET and for nothing else.
enum WalletKind { mobileMoney, eMoney, prepaid, payroll, superApp, other, unrecognised }

/// Whether the balance is owed to the subject or by them.
enum AccountNature {
  asset,
  liability,

  /// The platform's own UNKNOWN. It said so; this is not a parse failure.
  notStated,

  unrecognised,
}

/// How the record came to exist.
///
/// EXTERNAL_PROVIDER is in the platform's vocabulary because the column can
/// hold it. No path in this platform can produce it, no issuer exposes an
/// interface to it, and it is NOT a connection: see `data_origin.dart`, which
/// is the only place a source label is derived.
enum AccountOrigin { manual, csv, externalProvider, unrecognised }

/// The account's own lifecycle.
enum AccountLifecycle { active, archived, closed, unrecognised }

/// What kind of institution issued it.
enum IssuerKind {
  bank,
  eMoneyIssuer,
  mobileMoneyOperator,
  telcoFinancialServices,
  paymentInstitution,
  fintechWallet,
  cardIssuer,
  exchangeHouse,
  other,
  unrecognised,
}

/// Whether a catalogue entry may still be chosen.
enum IssuerStatus { active, retired, unrecognised }

/// A reviewed catalogue issuer, resolved for display.
///
/// It carries no country and no market: market presence is a separate
/// per-country concern the contract does not expose, and inventing one would
/// be a claim about where this issuer operates.
@immutable
final class Issuer {
  const Issuer({
    required this.issuerId,
    required this.code,
    required this.kind,
    required this.displayNameEn,
    required this.displayNameAr,
    required this.status,
  });

  final String issuerId;

  /// The catalogue's stable code. Used for grouping, never shown as a name.
  final String code;

  final IssuerKind kind;
  final String displayNameEn;
  final String displayNameAr;
  final IssuerStatus status;

  @override
  bool operator ==(Object other) =>
      other is Issuer &&
      other.issuerId == issuerId &&
      other.code == code &&
      other.kind == kind &&
      other.displayNameEn == displayNameEn &&
      other.displayNameAr == displayNameAr &&
      other.status == status;

  @override
  int get hashCode =>
      Object.hash(issuerId, code, kind, displayNameEn, displayNameAr, status);

  @override
  String toString() => 'Issuer($issuerId)';
}

/// Which issuer an account names, as a state rather than as two nullable
/// fields nobody has to read together.
///
/// The contract permits a reviewed catalogue entry OR the subject's own label
/// for an issuer the catalogue does not hold, never both: two names for one
/// issuer is a rule violation, not a merge.
@immutable
sealed class IssuerAttribution {
  const IssuerAttribution();

  /// A stable key for grouping. Never a display name — two issuers may share
  /// a label and must not be merged by it.
  String get groupingKey;
}

/// A reviewed catalogue issuer.
final class IssuerFromCatalogue extends IssuerAttribution {
  const IssuerFromCatalogue(this.issuer);

  final Issuer issuer;

  @override
  String get groupingKey => 'catalogue:${issuer.issuerId}';

  @override
  bool operator ==(Object other) =>
      other is IssuerFromCatalogue && other.issuer == issuer;

  @override
  int get hashCode => Object.hash(IssuerFromCatalogue, issuer);

  @override
  String toString() => 'IssuerFromCatalogue()';
}

/// The subject's own label for an issuer the catalogue does not hold. It is
/// never promoted to reference data and never matched against the catalogue.
final class IssuerUnlisted extends IssuerAttribution {
  const IssuerUnlisted(this.label);

  final String label;

  @override
  String get groupingKey => 'unlisted:$label';

  @override
  bool operator ==(Object other) => other is IssuerUnlisted && other.label == label;

  @override
  int get hashCode => Object.hash(IssuerUnlisted, label);

  @override
  String toString() => 'IssuerUnlisted()';
}

/// No issuer was named at all — cash, or an account the subject keeps
/// themselves.
final class IssuerNotStated extends IssuerAttribution {
  const IssuerNotStated();

  @override
  String get groupingKey => 'none';

  @override
  bool operator ==(Object other) => other is IssuerNotStated;

  @override
  int get hashCode => Object.hash(IssuerNotStated, 0);

  @override
  String toString() => 'IssuerNotStated()';
}

/// What this platform's relationship with the issuer actually is.
///
/// The platform emits the two claims below on the wire so a client cannot
/// infer otherwise from a status it recognises. Both are checked here rather
/// than assumed: see `data_origin.dart`.
@immutable
final class InstitutionLinkClaim {
  const InstitutionLinkClaim({
    required this.impliesLiveInstitutionLink,
    required this.providerAccessImplemented,
  });

  /// False for every value of every status vocabulary on this surface.
  final bool impliesLiveInstitutionLink;

  /// False while `providerAccessStatus` is NOT_IMPLEMENTED, which is its only
  /// permitted value.
  final bool providerAccessImplemented;

  @override
  bool operator ==(Object other) =>
      other is InstitutionLinkClaim &&
      other.impliesLiveInstitutionLink == impliesLiveInstitutionLink &&
      other.providerAccessImplemented == providerAccessImplemented;

  @override
  int get hashCode => Object.hash(impliesLiveInstitutionLink, providerAccessImplemented);

  @override
  String toString() => 'InstitutionLinkClaim()';
}

/// The currency an account is denominated in, with its exponent.
@immutable
final class CurrencyRef {
  const CurrencyRef({required this.code, required this.exponent});

  /// ISO 4217 alphabetic code, exactly as sent. Rendered as the code, never
  /// as a symbol several currencies share.
  final String code;

  final int exponent;

  @override
  bool operator ==(Object other) =>
      other is CurrencyRef && other.code == code && other.exponent == exponent;

  @override
  int get hashCode => Object.hash(code, exponent);

  @override
  String toString() => 'CurrencyRef($code)';
}

/// One account or wallet the authenticated principal owns.
@immutable
final class FinancialAccount {
  const FinancialAccount({
    required this.accountId,
    required this.displayName,
    required this.accountType,
    required this.walletKind,
    required this.nature,
    required this.currency,
    required this.mask,
    required this.issuer,
    required this.lifecycle,
    required this.origin,
    required this.link,
    required this.createdAt,
    required this.updatedAt,
    required this.version,
  });

  final String accountId;

  /// The subject's own name for the account.
  final String displayName;

  final AccountType accountType;

  /// Present for a WALLET and for nothing else — the platform holds the same
  /// biconditional, so a wallet kind on a savings account is a contract
  /// violation rather than something to render.
  final WalletKind? walletKind;

  final AccountNature nature;
  final CurrencyRef currency;
  final SafeMask mask;
  final IssuerAttribution issuer;
  final AccountLifecycle lifecycle;
  final AccountOrigin origin;
  final InstitutionLinkClaim link;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// The optimistic-concurrency version. Sent back on an edit so a concurrent
  /// change is refused rather than silently discarded.
  final int version;

  /// Whether this account is a wallet, decided on the type rather than on the
  /// presence of a wallet kind.
  bool get isWallet => accountType == AccountType.wallet;

  @override
  String toString() => 'FinancialAccount($accountId)';
}

/// The change set a manual account is created from.
///
/// `origin` is absent on purpose: the platform fixes it to MANUAL and accepts
/// no other value, so there is no field here through which an
/// EXTERNAL_PROVIDER account could be asked for. `status` is absent for the
/// same reason — a new account starts ACTIVE.
@immutable
final class ManualAccountDraft {
  const ManualAccountDraft({
    required this.displayName,
    required this.accountType,
    required this.currencyCode,
    this.walletKind,
    this.nature,
    this.issuerId,
    this.unlistedIssuerLabel,
    this.mask,
  });

  final String displayName;
  final AccountType accountType;

  /// ISO 4217 alphabetic code.
  final String currencyCode;

  final WalletKind? walletKind;
  final AccountNature? nature;

  /// A reviewed catalogue entry, or null.
  final String? issuerId;

  /// The subject's own label, or null. Never both this and [issuerId].
  final String? unlistedIssuerLabel;

  final String? mask;

  /// Whether the draft satisfies the two rules the platform enforces, so the
  /// client can say which one is broken instead of sending a request that can
  /// only fail.
  List<AccountDraftViolation> get violations => <AccountDraftViolation>[
        if (displayName.trim().isEmpty) AccountDraftViolation.displayNameRequired,
        if (currencyCode.trim().length != 3) AccountDraftViolation.currencyRequired,
        if (accountType == AccountType.wallet && walletKind == null)
          AccountDraftViolation.walletKindRequired,
        if (accountType != AccountType.wallet && walletKind != null)
          AccountDraftViolation.walletKindNotAllowed,
        if (issuerId != null &&
            unlistedIssuerLabel != null &&
            unlistedIssuerLabel!.trim().isNotEmpty)
          AccountDraftViolation.issuerNamedTwice,
      ];

  bool get isValid => violations.isEmpty;

  @override
  String toString() => 'ManualAccountDraft()';
}

/// A rule the client checks before it sends, so the person is told which field
/// is wrong rather than being handed the server's refusal.
enum AccountDraftViolation {
  displayNameRequired,
  currencyRequired,

  /// WALLET requires a wallet kind.
  walletKindRequired,

  /// Anything other than WALLET refuses one.
  walletKindNotAllowed,

  /// A catalogue issuer and a typed label are two names for one issuer.
  issuerNamedTwice,
}

/// The fields an existing account may be edited through.
///
/// A field left null is LEFT ALONE. Clearing a nullable field is a separate,
/// explicit request the platform distinguishes, which is why [clearMask] and
/// [clearIssuer] exist rather than being expressed as a null value.
@immutable
final class AccountEdit {
  const AccountEdit({
    required this.expectedVersion,
    this.displayName,
    this.accountType,
    this.walletKind,
    this.clearWalletKind = false,
    this.nature,
    this.lifecycle,
    this.mask,
    this.clearMask = false,
    this.issuerId,
    this.unlistedIssuerLabel,
    this.clearIssuer = false,
  });

  /// Required. A blind write would silently discard a concurrent edit.
  final int expectedVersion;

  final String? displayName;
  final AccountType? accountType;
  final WalletKind? walletKind;
  final bool clearWalletKind;
  final AccountNature? nature;
  final AccountLifecycle? lifecycle;
  final String? mask;
  final bool clearMask;
  final String? issuerId;
  final String? unlistedIssuerLabel;
  final bool clearIssuer;

  /// The currency is deliberately not editable here. The platform refuses to
  /// change it once records exist, and a client that offered the control
  /// would be offering a conversion this platform does not perform.
  bool get isEmpty =>
      displayName == null &&
      accountType == null &&
      walletKind == null &&
      !clearWalletKind &&
      nature == null &&
      lifecycle == null &&
      mask == null &&
      !clearMask &&
      issuerId == null &&
      unlistedIssuerLabel == null &&
      !clearIssuer;

  @override
  String toString() => 'AccountEdit()';
}
