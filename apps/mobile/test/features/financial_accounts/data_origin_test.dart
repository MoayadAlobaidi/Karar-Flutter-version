// "CONNECTED" IS UNREACHABLE.
//
// The first mutation this workstream is checked against is "render a manual or
// CSV account as Connected". These tests are what fails when somebody tries.
//
// The property is proven three ways, because one way is a condition somebody
// can edit:
//
//   1. EXHAUSTIVELY over every input the vocabularies permit — every account
//      origin, every rail crossed with every availability, every source kind
//      crossed with every availability. The mapping is asserted value by
//      value, so changing an arm fails here;
//   2. by SHAPE — no member of the label vocabulary asserts a live link, over
//      the whole enum rather than over the members someone remembered;
//   3. by SOURCE — no message in either language catalogue reads as a live
//      connection claim, and the label function's own file contains no such
//      arm. A "Connected" label would need a translated string, and there is
//      none to reach for.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/data_origin.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/source_rail.dart';

import 'support/financial_fixtures.dart';

/// Words that would assert a live institution link if they appeared in a
/// user-facing string on this surface.
final List<RegExp> connectionClaims = <RegExp>[
  RegExp(r'\bconnected\b', caseSensitive: false),
  RegExp(r'\bconnect\b', caseSensitive: false),
  RegExp(r'\blinked to\b', caseSensitive: false),
  RegExp(r'\blive link\b', caseSensitive: false),
  RegExp('متصل'),
  // The bare word "connection" is not scanned for: اتصالات is the ordinary
  // Arabic word for telecommunications and appears in an issuer-kind label.
  // Only the phrases that ASSERT a direct link are.
  RegExp('اتصال مباشر'),
  RegExp('ربط مباشر'),
  RegExp('ارتباط مباشر'),
];

/// Messages that legitimately contain the words above because they DENY the
/// claim. Listed individually so that adding one is a decision a human takes:
/// a substring scan cannot tell a denial from an assertion.
const Map<String, String> denialExceptions = <String, String>{
  'sourceNoLiveLinkNotice':
      'the notice whose whole purpose is to state that no live link exists',
};

/// Messages whose Arabic contains the letters of a scanned phrase as part of
/// an ordinary word rather than as a claim. Listed individually, because a
/// substring scan cannot tell a common noun from an assertion.
const Map<String, String> commonNounExceptions = <String, String>{
  'issuerKindTelcoFinancialServices':
      'اتصالات — the ordinary Arabic word for telecommunications, in the name '
          'of an issuer KIND rather than a claim about reachability',
};

void main() {
  group('an account origin never produces a connection', () {
    test('every origin maps to exactly one honest label', () {
      expect(dataOriginOfAccount(AccountOrigin.manual), DataOrigin.manuallyAdded);
      expect(dataOriginOfAccount(AccountOrigin.csv), DataOrigin.importedFromStatement);
      // The vocabulary member that reads like a provider connection. No path in
      // the platform can produce it, and it is not softened into one here.
      expect(
        dataOriginOfAccount(AccountOrigin.externalProvider),
        DataOrigin.notStated,
      );
      expect(dataOriginOfAccount(AccountOrigin.unrecognised), DataOrigin.notStated);
    });

    test('the mapping is total, so no origin falls through', () {
      for (final origin in AccountOrigin.values) {
        expect(DataOrigin.values, contains(dataOriginOfAccount(origin)));
      }
    });
  });

  group('a rail never produces a connection', () {
    test('only the two executable rails produce an active label', () {
      expect(
        dataOriginOfRail(ConnectionRail.manual, RailAvailability.executable),
        DataOrigin.manuallyAdded,
      );
      expect(
        dataOriginOfRail(ConnectionRail.userFileUpload, RailAvailability.executable),
        DataOrigin.fileImportOnly,
      );
    });

    test('every other rail, at every availability, says nothing was stated', () {
      for (final rail in ConnectionRail.values) {
        for (final availability in RailAvailability.values) {
          final origin = dataOriginOfRail(rail, availability);
          final isExecutablePair = availability == RailAvailability.executable &&
              (rail == ConnectionRail.manual || rail == ConnectionRail.userFileUpload);
          if (isExecutablePair) {
            continue;
          }
          expect(
            origin,
            DataOrigin.notStated,
            reason: 'rail ${rail.name} at ${availability.name} must claim nothing',
          );
        }
      }
    });

    test('an API rail is never rendered as working, even if it became available', () {
      // The rails the world has and this platform does not run. Should one
      // ever be marked EXECUTABLE by a server, the client still says nothing
      // rather than inventing a connection for it.
      for (final rail in <ConnectionRail>[
        ConnectionRail.openFinanceApi,
        ConnectionRail.directBankOrWalletApi,
        ConnectionRail.licensedAggregatorApi,
      ]) {
        expect(
          dataOriginOfRail(rail, RailAvailability.executable),
          DataOrigin.notStated,
        );
      }
    });
  });

  group('a source kind never produces a connection', () {
    test('the two runnable rails, and nothing else', () {
      expect(
        dataOriginOfSourceKind(SourceKind.manual, RailAvailability.executable),
        DataOrigin.manuallyAdded,
      );
      expect(
        dataOriginOfSourceKind(SourceKind.csv, RailAvailability.executable),
        DataOrigin.importedFromStatement,
      );
      for (final availability in RailAvailability.values) {
        expect(
          dataOriginOfSourceKind(SourceKind.externalProvider, availability),
          DataOrigin.notStated,
        );
      }
    });

    test('a rail that cannot run reports nothing, whatever its name', () {
      for (final kind in SourceKind.values) {
        expect(
          dataOriginOfSourceKind(kind, RailAvailability.notImplemented),
          DataOrigin.notStated,
        );
        expect(
          dataOriginOfSourceKind(kind, RailAvailability.unrecognised),
          DataOrigin.notStated,
        );
      }
    });
  });

  group('the label vocabulary itself', () {
    test('no member asserts a live institution link', () {
      for (final origin in DataOrigin.values) {
        expect(
          originAssertsLiveInstitutionLink(origin),
          isFalse,
          reason: '${origin.name} must not be readable as a connection',
        );
      }
    });

    test('no member is named for a connection', () {
      for (final origin in DataOrigin.values) {
        for (final claim in connectionClaims) {
          expect(
            claim.hasMatch(origin.name),
            isFalse,
            reason: '${origin.name} names a connection',
          );
        }
      }
    });
  });

  group('freshness is an observation, not a health claim', () {
    test('no source at all is distinct from a source that never delivered', () {
      expect(freshnessOf(const <AccountSourceLink>[]), isA<NoSourceObserved>());
      expect(
        freshnessOf(<AccountSourceLink>[sourceLink()]),
        isA<NeverImported>(),
      );
    });

    test('the last synchronised moment is the last SUCCESSFUL import', () {
      final freshness = freshnessOf(<AccountSourceLink>[
        sourceLink(lastSuccessfulImportAt: DateTime.utc(2026, 2, 1)),
        sourceLink(
          sourceLinkId: 'source-link-0002',
          lastSuccessfulImportAt: DateTime.utc(2026, 4, 1),
        ),
      ]);
      expect(freshness, isA<LastSynchronisedAt>());
      expect((freshness as LastSynchronisedAt).at, DateTime.utc(2026, 4, 1));
    });

    test('a source that was observed but never imported is never called fresh', () {
      // `lastObservedAt` is in the fixture and is deliberately not read: "we
      // saw the source" and "an import finished" are different facts.
      expect(
        freshnessOf(<AccountSourceLink>[sourceLink()]),
        isNot(isA<LastSynchronisedAt>()),
      );
    });
  });

  group('the copy catalogue offers no way to claim a connection', () {
    test('no financial message in either language reads as a live link', () {
      for (final path in <String>[
        'lib/l10n/arb/app_en.arb',
        'lib/l10n/arb/app_ar.arb',
      ]) {
        final catalogue =
            jsonDecode(File(path).readAsStringSync()) as Map<String, Object?>;
        final offenders = <String>[];
        for (final entry in catalogue.entries) {
          if (entry.key.startsWith('@') || entry.value is! String) {
            continue;
          }
          if (!_isFinancialKey(entry.key) ||
              denialExceptions.containsKey(entry.key) ||
              commonNounExceptions.containsKey(entry.key)) {
            continue;
          }
          final message = entry.value! as String;
          for (final claim in connectionClaims) {
            if (claim.hasMatch(message)) {
              offenders.add('${entry.key}: $message');
            }
          }
        }
        expect(
          offenders,
          isEmpty,
          reason: '$path offers a string that reads as a live institution link. '
              'No issuer exposes an interface to this platform, so no such '
              'string may exist for a screen to reach for:\n${offenders.join('\n')}',
        );
      }
    });

    test('every documented exception still denies rather than asserts', () {
      // An exception that stopped denying would be an assertion nobody
      // noticed. Both languages are checked, and both must still say "no".
      final english = jsonDecode(
        File('lib/l10n/arb/app_en.arb').readAsStringSync(),
      ) as Map<String, Object?>;
      for (final key in denialExceptions.keys) {
        final message = english[key]! as String;
        expect(
          message.toLowerCase(),
          anyOf(contains('no live link'), contains('does not connect')),
          reason: '$key is exempted as a denial (${denialExceptions[key]}) and '
              'no longer reads as one',
        );
      }
    });

    test('the documented common-noun exceptions are still real', () {
      // An exception that no longer applies is a hole nobody closed.
      final arabic = jsonDecode(
        File('lib/l10n/arb/app_ar.arb').readAsStringSync(),
      ) as Map<String, Object?>;
      for (final key in commonNounExceptions.keys) {
        expect(
          arabic.containsKey(key),
          isTrue,
          reason: '$key is exempted but is no longer in the catalogue',
        );
      }
    });

    test('the notice that denies a live link is present in both languages', () {
      for (final path in <String>[
        'lib/l10n/arb/app_en.arb',
        'lib/l10n/arb/app_ar.arb',
      ]) {
        final catalogue =
            jsonDecode(File(path).readAsStringSync()) as Map<String, Object?>;
        expect(
          catalogue['sourceNoLiveLinkNotice'],
          isA<String>(),
          reason: '$path must carry the notice the source section renders',
        );
      }
    });

    test('the derivation file declares no connected arm', () {
      final source = File(
        'lib/features/financial_accounts/domain/data_origin.dart',
      ).readAsStringSync();
      final body = source
          .split('\n')
          .map((String line) => line.trimLeft().startsWith('//') ? '' : line)
          .join('\n');
      expect(body, isNot(contains('connected')));
      expect(body, isNot(contains('Connected')));
      expect(body, isNot(contains('synced')));
    });
  });
}

/// Whether a message key belongs to this workstream's surface.
///
/// The scan is scoped: the identity and consent catalogues legitimately talk
/// about connections of other kinds, and this rule is about the financial
/// surface's own claims.
bool _isFinancialKey(String key) {
  const List<String> prefixes = <String>[
    'account',
    'accounts',
    'balance',
    'balances',
    'category',
    'categories',
    'dataOrigin',
    'direction',
    'financial',
    'groupBy',
    'instrument',
    'instruments',
    'issuer',
    'provenance',
    'revisable',
    'source',
    'transaction',
    'transactions',
    'wallet',
  ];
  for (final prefix in prefixes) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}
