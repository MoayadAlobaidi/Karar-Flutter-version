// PURE DART ONLY. See lib/README.md — domain purity.
//
// THE WHOLE PORTFOLIO, GROUPED AND FILTERED — AND NEVER ADDED UP.
//
// A person can hold several accounts at one issuer, two of the same type and
// currency at that issuer, accounts in several currencies, several cards,
// several wallets from one issuer, cash, and accounts they keep by hand. All
// of that is normal and none of it is deduplicated: two savings accounts in
// the same currency at the same issuer are two accounts, and merging them
// would lose a distinction the person made deliberately.
//
// WHAT THIS FILE CANNOT DO, structurally rather than by convention:
//
//   * it cannot total anything. There is no `sum`, no `fold` over an amount
//     and no member that holds a figure — a group holds ACCOUNTS, never money;
//   * it therefore cannot add two currencies together, because it cannot add
//     one currency to itself either;
//   * it cannot produce a net worth, a score, a forecast or a budget. Those
//     are Phase 6, and the type that would carry one does not exist.
//
// Currency appears here only as a way to KEEP amounts apart. Grouping by
// currency is the opposite of converting between currencies: it is the
// arrangement that makes a cross-currency total impossible to write by
// accident.
import 'package:meta/meta.dart';

import 'financial_account.dart';

/// The axis a portfolio is grouped along.
enum PortfolioGrouping {
  issuer,
  issuerKind,
  accountType,
  walletKind,
  nature,
  currency,
  lifecycle,
  origin,
}

/// The filters a person can narrow the portfolio with.
///
/// Every field is optional and null means "do not narrow on this axis". A
/// filter never widens the set: it is applied to the accounts the platform
/// already returned for this principal.
@immutable
final class PortfolioFilter {
  const PortfolioFilter({
    this.issuerKey,
    this.issuerKind,
    this.accountType,
    this.walletKind,
    this.nature,
    this.currencyCode,
    this.lifecycle,
    this.origin,
  });

  /// [IssuerAttribution.groupingKey], so an unlisted issuer filters as
  /// precisely as a catalogue one.
  final String? issuerKey;

  final IssuerKind? issuerKind;
  final AccountType? accountType;
  final WalletKind? walletKind;
  final AccountNature? nature;
  final String? currencyCode;
  final AccountLifecycle? lifecycle;
  final AccountOrigin? origin;

  bool get isEmpty =>
      issuerKey == null &&
      issuerKind == null &&
      accountType == null &&
      walletKind == null &&
      nature == null &&
      currencyCode == null &&
      lifecycle == null &&
      origin == null;

  /// How many axes are narrowed. Rendered so a person can see that a short
  /// list is a filtered list rather than an empty portfolio.
  int get activeCount => <Object?>[
        issuerKey,
        issuerKind,
        accountType,
        walletKind,
        nature,
        currencyCode,
        lifecycle,
        origin,
      ].where((Object? value) => value != null).length;

  PortfolioFilter copyWith({
    String? issuerKey,
    IssuerKind? issuerKind,
    AccountType? accountType,
    WalletKind? walletKind,
    AccountNature? nature,
    String? currencyCode,
    AccountLifecycle? lifecycle,
    AccountOrigin? origin,
    bool clearIssuerKey = false,
    bool clearIssuerKind = false,
    bool clearAccountType = false,
    bool clearWalletKind = false,
    bool clearNature = false,
    bool clearCurrencyCode = false,
    bool clearLifecycle = false,
    bool clearOrigin = false,
  }) =>
      PortfolioFilter(
        issuerKey: clearIssuerKey ? null : (issuerKey ?? this.issuerKey),
        issuerKind: clearIssuerKind ? null : (issuerKind ?? this.issuerKind),
        accountType: clearAccountType ? null : (accountType ?? this.accountType),
        walletKind: clearWalletKind ? null : (walletKind ?? this.walletKind),
        nature: clearNature ? null : (nature ?? this.nature),
        currencyCode: clearCurrencyCode ? null : (currencyCode ?? this.currencyCode),
        lifecycle: clearLifecycle ? null : (lifecycle ?? this.lifecycle),
        origin: clearOrigin ? null : (origin ?? this.origin),
      );

  bool matches(FinancialAccount account) {
    if (issuerKey != null && account.issuer.groupingKey != issuerKey) {
      return false;
    }
    if (issuerKind != null && _issuerKindOf(account) != issuerKind) {
      return false;
    }
    if (accountType != null && account.accountType != accountType) {
      return false;
    }
    if (walletKind != null && account.walletKind != walletKind) {
      return false;
    }
    if (nature != null && account.nature != nature) {
      return false;
    }
    if (currencyCode != null && account.currency.code != currencyCode) {
      return false;
    }
    if (lifecycle != null && account.lifecycle != lifecycle) {
      return false;
    }
    if (origin != null && account.origin != origin) {
      return false;
    }
    return true;
  }

  @override
  String toString() => 'PortfolioFilter($activeCount)';
}

/// The issuer kind of an account, or null when no catalogue issuer is named.
///
/// An unlisted issuer has no kind and none is guessed from its label.
IssuerKind? _issuerKindOf(FinancialAccount account) => switch (account.issuer) {
      IssuerFromCatalogue(:final issuer) => issuer.kind,
      IssuerUnlisted() => null,
      IssuerNotStated() => null,
    };

/// One group of accounts, named by the value they share.
@immutable
final class PortfolioGroup {
  const PortfolioGroup({
    required this.grouping,
    required this.key,
    required this.accounts,
  });

  final PortfolioGrouping grouping;

  /// The shared value, as a stable key. The screen turns it into a heading;
  /// this layer never holds a translated string.
  final PortfolioGroupKey key;

  /// Every account in the group, in the platform's own order. It holds
  /// accounts and nothing else — no figure, no count of money, no total.
  final List<FinancialAccount> accounts;

  @override
  String toString() => 'PortfolioGroup(${grouping.name})';
}

/// The identity of a group, kept as data so the presentation layer decides how
/// to name it.
@immutable
final class PortfolioGroupKey {
  const PortfolioGroupKey({
    required this.identifier,
    this.issuer,
    this.issuerKind,
    this.accountType,
    this.walletKind,
    this.nature,
    this.currencyCode,
    this.lifecycle,
    this.origin,
    this.unlistedIssuerLabel,
  });

  /// Stable and unique within one grouping. Used for ordering and for keys.
  final String identifier;

  final Issuer? issuer;
  final IssuerKind? issuerKind;
  final AccountType? accountType;
  final WalletKind? walletKind;
  final AccountNature? nature;
  final String? currencyCode;
  final AccountLifecycle? lifecycle;
  final AccountOrigin? origin;

  /// The subject's own issuer label, when the group is an unlisted issuer.
  final String? unlistedIssuerLabel;

  @override
  bool operator ==(Object other) =>
      other is PortfolioGroupKey && other.identifier == identifier;

  @override
  int get hashCode => identifier.hashCode;

  @override
  String toString() => 'PortfolioGroupKey()';
}

/// The portfolio, as the screen renders it.
@immutable
final class AccountPortfolio {
  const AccountPortfolio({
    required this.accounts,
    required this.groups,
    required this.grouping,
    required this.filter,
    required this.totalBeforeFilter,
  });

  /// Every account that survived the filter, in platform order.
  final List<FinancialAccount> accounts;

  final List<PortfolioGroup> groups;
  final PortfolioGrouping grouping;
  final PortfolioFilter filter;

  /// How many accounts the platform returned before filtering. A COUNT OF
  /// ROWS, which is the only kind of arithmetic on this surface — it is not
  /// money and cannot become money.
  final int totalBeforeFilter;

  bool get isEmpty => accounts.isEmpty;

  /// Whether the portfolio is empty because the filter emptied it, which is a
  /// different sentence from "you have no accounts".
  bool get isEmptiedByFilter => accounts.isEmpty && totalBeforeFilter > 0;

  /// The distinct currencies present, in first-seen order.
  ///
  /// The set exists so the screen can say plainly that amounts in different
  /// currencies are not comparable. It is a set of CODES; there is no
  /// accompanying figure and no conversion between any two of them.
  List<String> get currencies {
    final seen = <String>[];
    for (final account in accounts) {
      if (!seen.contains(account.currency.code)) {
        seen.add(account.currency.code);
      }
    }
    return List<String>.unmodifiable(seen);
  }

  /// Builds a portfolio from the accounts the platform returned.
  static AccountPortfolio from(
    List<FinancialAccount> all, {
    PortfolioFilter filter = const PortfolioFilter(),
    PortfolioGrouping grouping = PortfolioGrouping.issuer,
  }) {
    final kept = <FinancialAccount>[
      for (final account in all)
        if (filter.matches(account)) account,
    ];
    return AccountPortfolio(
      accounts: List<FinancialAccount>.unmodifiable(kept),
      groups: _group(kept, grouping),
      grouping: grouping,
      filter: filter,
      totalBeforeFilter: all.length,
    );
  }

  /// The values present on one axis, so the filter offers only what the
  /// portfolio actually contains. Derived from the UNFILTERED set by the
  /// caller, which is why it takes its own list.
  static List<PortfolioGroupKey> optionsFor(
    List<FinancialAccount> all,
    PortfolioGrouping grouping,
  ) =>
      _group(all, grouping)
          .map((PortfolioGroup group) => group.key)
          .toList(growable: false);

  static List<PortfolioGroup> _group(
    List<FinancialAccount> accounts,
    PortfolioGrouping grouping,
  ) {
    final order = <String>[];
    final byKey = <String, List<FinancialAccount>>{};
    final keys = <String, PortfolioGroupKey>{};

    for (final account in accounts) {
      final key = _keyFor(account, grouping);
      if (!byKey.containsKey(key.identifier)) {
        order.add(key.identifier);
        byKey[key.identifier] = <FinancialAccount>[];
        keys[key.identifier] = key;
      }
      byKey[key.identifier]!.add(account);
    }

    return List<PortfolioGroup>.unmodifiable(<PortfolioGroup>[
      for (final identifier in order)
        PortfolioGroup(
          grouping: grouping,
          key: keys[identifier]!,
          accounts: List<FinancialAccount>.unmodifiable(byKey[identifier]!),
        ),
    ]);
  }

  static PortfolioGroupKey _keyFor(
    FinancialAccount account,
    PortfolioGrouping grouping,
  ) {
    switch (grouping) {
      case PortfolioGrouping.issuer:
        final attribution = account.issuer;
        return PortfolioGroupKey(
          identifier: attribution.groupingKey,
          issuer: attribution is IssuerFromCatalogue ? attribution.issuer : null,
          unlistedIssuerLabel:
              attribution is IssuerUnlisted ? attribution.label : null,
        );
      case PortfolioGrouping.issuerKind:
        final kind = _issuerKindOf(account);
        return PortfolioGroupKey(
          identifier: 'issuerKind:${kind?.name ?? 'none'}',
          issuerKind: kind,
        );
      case PortfolioGrouping.accountType:
        return PortfolioGroupKey(
          identifier: 'accountType:${account.accountType.name}',
          accountType: account.accountType,
        );
      case PortfolioGrouping.walletKind:
        return PortfolioGroupKey(
          identifier: 'walletKind:${account.walletKind?.name ?? 'none'}',
          walletKind: account.walletKind,
        );
      case PortfolioGrouping.nature:
        return PortfolioGroupKey(
          identifier: 'nature:${account.nature.name}',
          nature: account.nature,
        );
      case PortfolioGrouping.currency:
        return PortfolioGroupKey(
          identifier: 'currency:${account.currency.code}',
          currencyCode: account.currency.code,
        );
      case PortfolioGrouping.lifecycle:
        return PortfolioGroupKey(
          identifier: 'lifecycle:${account.lifecycle.name}',
          lifecycle: account.lifecycle,
        );
      case PortfolioGrouping.origin:
        return PortfolioGroupKey(
          identifier: 'origin:${account.origin.name}',
          origin: account.origin,
        );
    }
  }

  @override
  String toString() => 'AccountPortfolio(${accounts.length})';
}
