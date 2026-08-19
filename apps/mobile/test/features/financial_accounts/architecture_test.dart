// THE FINANCIAL WORKSTREAM'S OWN ARCHITECTURE RULES.
//
// `test/core/architecture/layer_rules_test.dart` already holds the rules that
// apply to every feature. These are the ones this surface needs on top,
// because they are about MONEY rather than about layering:
//
//   * no widget performs a request, and no presentation file imports a
//     repository implementation;
//   * no double, no float parse and no `toString()` on a number reaches the
//     money path;
//   * nothing renders a full account number, an IBAN, a PAN, a CVV, a provider
//     identifier, a fingerprint, ciphertext, a key version or an object
//     locator — and nothing reconstructs a placeholder implying one;
//   * no financial value is written to a preference store, a log, a crash sink
//     or a navigation argument;
//   * no country or jurisdiction is branched on anywhere in the business
//     logic.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The four feature folders this workstream owns.
const List<String> financialRoots = <String>[
  'lib/features/financial_accounts',
  'lib/features/payment_instruments',
  'lib/features/transactions',
  'lib/features/transaction_categories',
];

List<_Source> _sources({String? layer}) {
  final found = <_Source>[];
  for (final root in financialRoots) {
    final directory = Directory(root);
    if (!directory.existsSync()) {
      continue;
    }
    for (final file in directory.listSync(recursive: true).whereType<File>()) {
      final path = file.path.replaceAll(r'\', '/');
      if (!path.endsWith('.dart')) {
        continue;
      }
      if (layer != null && !path.contains('/$layer/')) {
        continue;
      }
      found.add(_Source(path, file));
    }
  }
  return found;
}

void main() {
  test('the scan found this workstream\'s source', () {
    expect(_sources(), isNotEmpty);
    expect(_sources(layer: 'domain'), isNotEmpty);
    expect(_sources(layer: 'data'), isNotEmpty);
    expect(_sources(layer: 'presentation'), isNotEmpty);
  });

  group('layers', () {
    test('domain imports pure Dart only', () {
      const List<String> forbidden = <String>[
        'package:flutter/',
        'package:flutter_riverpod/',
        'package:go_router/',
        'package:dio/',
        'package:intl/',
        'dart:io',
        'dart:ui',
        'dart:convert',
        'networking/',
        '/data/',
        '/presentation/',
      ];
      final offenders = <String>[];
      for (final source in _sources(layer: 'domain')) {
        for (final import in source.imports) {
          for (final rule in forbidden) {
            if (import.contains(rule)) {
              offenders.add('${source.path} imports $import');
            }
          }
        }
      }
      expect(offenders, isEmpty, reason: offenders.join('\n'));
    });

    test('only a providers file names a repository implementation', () {
      // The providers file is this feature's composition seam and is the one
      // place allowed to construct a repository — the same shape the profile
      // feature uses. A SCREEN that named one would be reaching past the
      // provider graph, which is what this rule catches.
      final offenders = <String>[];
      for (final source in _sources(layer: 'presentation')) {
        if (source.path.endsWith('_providers.dart')) {
          continue;
        }
        for (final import in source.imports) {
          if (import.contains('/data/')) {
            offenders.add('${source.path} imports $import');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'a screen reaches a repository through a provider, never by name:\n'
            '${offenders.join('\n')}',
      );
    });

    test('no widget performs HTTP', () {
      final offenders = <String>[];
      for (final source in _sources(layer: 'presentation')) {
        for (final needle in <String>[
          'ApiRequest(',
          'ApiTransport',
          'HttpMethod.',
          'FinancialGateway(',
        ]) {
          if (source.body.contains(needle)) {
            offenders.add('${source.path} uses $needle');
          }
        }
      }
      // `financialGatewayProvider` is the one exception and is a provider
      // declaration rather than a request: it appears in accounts_providers,
      // which is the composition seam for this feature.
      expect(
        offenders.where((String hit) => !hit.contains('accounts_providers.dart')),
        isEmpty,
        reason: offenders.join('\n'),
      );
    });

    test('only the data layer reaches the transport', () {
      final offenders = <String>[];
      for (final source in _sources()) {
        if (source.path.contains('/data/')) {
          continue;
        }
        for (final import in source.imports) {
          if (import.contains('core/networking/api_transport') ||
              import.contains('core/networking/http_method') ||
              import.contains('core/networking/generated/')) {
            offenders.add('${source.path} imports $import');
          }
        }
      }
      expect(offenders, isEmpty, reason: offenders.join('\n'));
    });
  });

  group('money never becomes a float', () {
    test('no double, no parse to a float, no toStringAsFixed', () {
      final offenders = <String>[];
      for (final source in _sources()) {
        for (final pattern in <RegExp>[
          RegExp(r'\bdouble\b'),
          RegExp(r'\bdouble\.parse\b'),
          RegExp(r'\btoStringAsFixed\b'),
          RegExp(r'\btoDouble\(\)'),
          RegExp(r'\bnum\.parse\b'),
        ]) {
          for (final match in pattern.allMatches(source.body)) {
            offenders.add('${source.path}:${source.lineOf(match.start)}');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'a binary float is not a ledger value (ADR-0006):\n'
            '${offenders.join('\n')}',
      );
    });

    test('no amount is rendered by interpolating a number', () {
      // `minorUnits` is a String and stays one. A `.toString()` on it would be
      // harmless; a `.toString()` on a number in the money path is the defect
      // this rule exists for, and there is no number in the path to call it on.
      final offenders = <String>[];
      for (final source in _sources()) {
        for (final match
            in RegExp(r'minorUnits\s*\.\s*toString\(\)').allMatches(source.body)) {
          offenders.add('${source.path}:${source.lineOf(match.start)}');
        }
      }
      expect(offenders, isEmpty, reason: offenders.join('\n'));
    });
  });

  group('nothing sensitive is rendered, stored or logged', () {
    test('no field the contract never sends is referenced', () {
      const List<String> forbidden = <String>[
        'iban',
        'IBAN',
        'panNumber',
        'cardNumber',
        'accountNumber',
        'cvv',
        'CVV',
        'ciphertext',
        'keyVersion',
        'authTag',
        'nonce',
        'objectLocator',
        'storageKey',
        'providerId',
        'providerReference',
        'externalAccountRef',
        'fingerprint',
      ];
      final offenders = <String>[];
      for (final source in _sources()) {
        for (final name in forbidden) {
          if (!source.body.contains(name)) {
            continue;
          }
          // `fingerprintVersion` is the ALGORITHM version the contract does
          // send; the fingerprint itself is absent from the projection.
          if (name == 'fingerprint' &&
              !RegExp(r'fingerprint(?!Version)').hasMatch(source.body)) {
            continue;
          }
          offenders.add('${source.path} references "$name"');
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'the platform sends none of these and the client reconstructs '
            'none of them:\n${offenders.join('\n')}',
      );
    });

    test('no financial value reaches a preference store', () {
      final offenders = <String>[];
      for (final source in _sources()) {
        for (final needle in <String>[
          'SharedPreferences',
          'KeyValueStore',
          'keyValueStoreProvider',
          'SecureStore',
        ]) {
          if (source.body.contains(needle)) {
            offenders.add('${source.path} uses $needle');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'financial data is read from the platform on demand and is '
            'never persisted on the device:\n${offenders.join('\n')}',
      );
    });

    test('nothing here logs at all', () {
      final offenders = <String>[];
      for (final source in _sources()) {
        for (final needle in <RegExp>[
          RegExp(r'\bAppLogger\b'),
          RegExp(r'\bdebugPrint\b'),
          RegExp(r'\bdeveloper\.log\b'),
          RegExp(r'(?<![\w.])log\s*\('),
        ]) {
          if (needle.hasMatch(source.body)) {
            offenders.add('${source.path} matches ${needle.pattern}');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'a diagnostic sink is the easiest way for an amount, a mask or '
            'an account name to leave the device:\n${offenders.join('\n')}',
      );
    });

    test('no financial VALUE is interpolated into a toString', () {
      // Opaque identifiers, counts and enum names are permitted: the contract
      // states the ids are opaque and non-secret, and support needs one
      // quotable reference. A holder's own value is not — an amount, a name, a
      // mask, a merchant or a currency in a toString is one framework error
      // away from a crash dump.
      const List<String> holderValues = <String>[
        'amount',
        'minorUnits',
        'displayName',
        'displayLabel',
        'mask',
        'merchant',
        'description',
        'note',
        'currency',
        'label',
      ];
      final offenders = <String>[];
      for (final source in _sources()) {
        for (final match in RegExp(
          r"String toString\(\) =>\s*'([^']*)'",
        ).allMatches(source.body)) {
          final rendering = match.group(1)!;
          for (final value in holderValues) {
            if (rendering.contains(r'$' + value) ||
                rendering.contains(r'${' + value)) {
              offenders.add('${source.path}: $rendering');
            }
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'a toString is the easiest route from a value to a crash '
            'dump:\n${offenders.join('\n')}',
      );
    });

    test('no display name, amount or mask travels in a route', () {
      final routes = File(
        'lib/features/financial_accounts/presentation/financial_routes.dart',
      )
          .readAsLinesSync()
          .map((String line) => line.trimLeft().startsWith('//') ? '' : line)
          .join('\n');
      for (final name in <String>[
        'displayName',
        'amount',
        'mask',
        'currency',
        'issuer',
      ]) {
        expect(
          routes.contains(name),
          isFalse,
          reason: 'a route is a deep link and a restoration bundle; "$name" '
              'has no business in one',
        );
      }
    });
  });

  group('no country or jurisdiction branching', () {
    test('no business logic keys on a country or a jurisdiction', () {
      final offenders = <String>[];
      for (final source in _sources()) {
        for (final pattern in <RegExp>[
          RegExp(r'\bcountryCode\b'),
          RegExp(r'\bjurisdiction\w*\s*==', caseSensitive: false),
          RegExp(r'\bcountry\w*\s*==', caseSensitive: false),
          RegExp(r"==\s*'(QA|SA|AE|KW|BH|OM)'"),
        ]) {
          for (final match in pattern.allMatches(source.body)) {
            offenders.add('${source.path}:${source.lineOf(match.start)}');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'behaviour differences resolve through policy packs, never '
            'through a country test in a feature:\n${offenders.join('\n')}',
      );
    });

    test('a currency code is data, never a branch', () {
      // Currency appears throughout as a value to render and to group by. What
      // must not appear is a decision taken because of which currency it is.
      final offenders = <String>[];
      for (final source in _sources()) {
        for (final match in RegExp(
          r"currency(?:Code)?\s*==\s*'[A-Z]{3}'",
        ).allMatches(source.body)) {
          offenders.add('${source.path}:${source.lineOf(match.start)}');
        }
      }
      expect(offenders, isEmpty, reason: offenders.join('\n'));
    });
  });
}

final class _Source {
  _Source(this.path, File file)
      : body = file
            .readAsLinesSync()
            .map((String line) => line.trimLeft().startsWith('//') ? '' : line)
            .join('\n'),
        imports = <String>[
          for (final line in file.readAsLinesSync())
            if (line.trim().startsWith('import ') || line.trim().startsWith('export '))
              RegExp("['\"]([^'\"]+)['\"]").firstMatch(line)?.group(1) ?? '',
        ];

  final String path;

  /// Content with comment-only lines blanked, so prose explaining a rule
  /// cannot trip the rule it explains.
  final String body;

  final List<String> imports;

  int lineOf(int offset) => '\n'.allMatches(body.substring(0, offset)).length + 1;
}
