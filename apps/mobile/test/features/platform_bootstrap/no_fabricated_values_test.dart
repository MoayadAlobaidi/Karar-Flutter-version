// REGRESSION: NO FABRICATED FINANCIAL DATA IN THIS WORKSTREAM'S SOURCE, AND
// NO DENYLIST STANDING IN FOR CAPABILITY VISIBILITY.
//
// A widget test proves what one screen renders for one set of inputs. This
// reads the source instead, so a value that is only reachable through a state
// no test happens to mount is still caught. It covers production code, copy
// catalogues and fixtures alike, because a fabricated figure is invented in a
// fixture at least as often as in a screen.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The directories this workstream owns.
const List<String> ownedSourceRoots = <String>[
  'lib/features/platform_bootstrap',
  'lib/features/tenant_selection',
  'lib/features/consent',
  'lib/features/profile',
  'lib/features/settings',
];

const List<String> ownedTestRoots = <String>[
  'test/features/platform_bootstrap',
  'test/features/tenant_selection',
  'test/features/consent',
  'test/features/profile',
  'test/features/settings',
];

/// Patterns that would indicate a monetary value written into the client.
final Map<RegExp, String> financialPatterns = <RegExp, String>{
  // A bare currency sign. Dart string interpolation also starts with `$`, so
  // the dollar arm excludes `${` and `$identifier`, which are syntax rather
  // than money.
  RegExp(r'[€£¥]|\$(?![{A-Za-z_])'): 'a currency symbol',
  RegExp(r'''['"]\s*(QAR|USD|EUR|SAR|AED|GBP)\s*['"]'''): 'a currency code literal',
  RegExp(r'''['"][^'"]*\b\d{1,3}(,\d{3})+(\.\d+)?\b[^'"]*['"]'''):
      'a grouped numeric literal that reads as an amount',
  RegExp(r'\b(balance|portfolio|netWorth|net_worth|amountMinor|minorUnits)\b'):
      'a balance-shaped identifier',
};

List<File> dartFilesUnder(Iterable<String> roots) => <File>[
  for (final root in roots)
    if (Directory(root).existsSync())
      ...Directory(root)
          .listSync(recursive: true)
          .whereType<File>()
          .where((File file) => file.path.endsWith('.dart')),
];

/// File content with comment-only lines blanked, so prose explaining a rule
/// cannot trip the rule it explains.
String withoutCommentLines(File file) => file
    .readAsLinesSync()
    .map((String line) => line.trimLeft().startsWith('//') ? '' : line)
    .join('\n');

void main() {
  test('the scan finds this workstream\'s source', () {
    expect(dartFilesUnder(ownedSourceRoots), isNotEmpty);
    expect(dartFilesUnder(ownedTestRoots), isNotEmpty);
  });

  test('no financial value appears in production code or in a fixture', () {
    final offenders = <String>[];
    for (final file in dartFilesUnder(<String>[...ownedSourceRoots, ...ownedTestRoots])) {
      final content = withoutCommentLines(file);
      // A regression suite necessarily holds the patterns it hunts for, so it
      // would flag itself. Recognising them by the assertion helper they call
      // keeps this exemption from drifting as suites are added or renamed.
      if (file.path.endsWith('no_fabricated_values_test.dart') ||
          content.contains('expectNothingMatching')) {
        continue;
      }
      for (final entry in financialPatterns.entries) {
        for (final match in entry.key.allMatches(content)) {
          offenders.add('${file.path}: ${entry.value} — ${match.group(0)}');
        }
      }
    }

    expect(
      offenders,
      isEmpty,
      reason:
          'The platform publishes no financial value in this phase and the client '
          'invents none, in a screen, a fixture or a test:\n${offenders.join('\n')}',
    );
  });

  test('capability visibility is expressed as an allowlist, never as a denylist', () {
    // A denylist ships the names it suppresses in the compiled artifact, and
    // protects only the names someone thought to write down. The rule has to
    // be positive: an identifier renders because this build registered a
    // destination for it, and for no other reason.
    final source = File('lib/features/platform_bootstrap/domain/platform_capability.dart')
        .readAsStringSync();

    for (final denylistShape in <RegExp>[
      RegExp(r'\bwithheld\w*\s*=\s*<String>\{'),
      RegExp(r'\bblocked\w*\s*=\s*<String>\{'),
      RegExp(r'\bhidden\w*Ids\s*=\s*<String>\{'),
      RegExp(r'\bdeny\w*\s*=\s*<String>\{'),
    ]) {
      expect(
        denylistShape.hasMatch(source),
        isFalse,
        reason: 'capability visibility must not be enforced by a list of names',
      );
    }
    expect(source, contains('isNavigable'));
  });

  test('no product capability is registered as navigable', () {
    // The moment one is, a screen must exist for it. Keeping this assertion
    // here means the review question is asked at the same time as the change.
    final source = File('lib/features/platform_bootstrap/domain/platform_capability.dart')
        .readAsStringSync();

    expect(
      source,
      contains('const Set<String> navigableCapabilityIds = <String>{};'),
      reason: 'no capability is implemented or deployed in this build',
    );
  });

  test('no consent evidence or credential is written to a diagnostic sink', () {
    // `sessionId` is deliberately absent from this list: the contract states it
    // is opaque and non-secret, and the core session code logs it for exactly
    // that reason. Everything below is either a credential, a consent record,
    // or personal data.
    const List<String> forbiddenInLogs = <String>[
      'accessToken',
      'refreshToken',
      'token.value',
      'grantId',
      'grantedVersion',
      'evidence',
      'displayName',
      'purposeRef',
      'legalDocumentVersionId',
      'consentVersion',
    ];

    final offenders = <String>[];
    for (final file in dartFilesUnder(ownedSourceRoots)) {
      final content = withoutCommentLines(file);
      final logCalls = RegExp(r'\b_logger\.(info|warning|error|debug)\(([^;]*);', dotAll: true);
      for (final match in logCalls.allMatches(content)) {
        final call = match.group(0)!;
        for (final forbidden in forbiddenInLogs) {
          if (call.contains(forbidden)) {
            offenders.add('${file.path}: a log call mentions "$forbidden"');
          }
        }
      }
    }

    expect(offenders, isEmpty, reason: offenders.join('\n'));
  });

  test('the consent and invitation repositories hold no logger at all', () {
    for (final path in <String>[
      'lib/features/consent/data/api_consent_repository.dart',
      'lib/features/tenant_selection/data/api_tenant_invitation_repository.dart',
    ]) {
      final content = withoutCommentLines(File(path));
      expect(
        content.contains('AppLogger'),
        isFalse,
        reason: '$path must not be able to log consent evidence or a bearer token',
      );
    }
  });
}
