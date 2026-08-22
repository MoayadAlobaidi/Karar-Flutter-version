// EVERY VOCABULARY MEMBER HAS ITS OWN SENTENCE, IN BOTH LANGUAGES.
//
// The switches in `connection_labels.dart` are exhaustive with no `default`
// arm, so a member added to a vocabulary stops the build until somebody writes
// a sentence for it. That is a compile-time guarantee about COVERAGE and says
// nothing about the sentences themselves — two members mapped to one string
// compile perfectly and tell a person the same thing about two different
// situations.
//
// These tests are the other half, and on this surface one of them carries real
// weight: NOT_CONFIGURED, UNAVAILABLE and NOT_IMPLEMENTED must be three
// sentences. "You have not set this up", "this is off right now" and "this was
// never built" send a person to three different conclusions, and only one of
// them will ever change. A build that merged any pair would compile, pass every
// other test, and quietly tell somebody to wait for something that does not
// exist.
//
// The second weight-bearing test is the vocabulary itself: [RailStanding] is
// asserted MEMBER BY NAME, so a `comingSoon` added later fails here rather than
// shipping as a promise nobody made.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/source_rail.dart';
import 'package:karar_mobile/features/financial_connections/domain/financial_connection.dart';
import 'package:karar_mobile/features/financial_connections/domain/financial_connections_repository.dart';
import 'package:karar_mobile/features/financial_connections/domain/rail_standing.dart';
import 'package:karar_mobile/features/financial_connections/domain/source_arrival.dart';
import 'package:karar_mobile/features/financial_connections/presentation/connection_labels.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

/// Runs [body] under each shipped locale, so a sentence missing from one
/// catalogue is a failure rather than an English-only pass.
void inBothLanguages(
  String description,
  void Function(AppLocalizations l10n, String language) body,
) {
  for (final locale in <Locale>[
    KararLocalization.english,
    KararLocalization.arabic,
  ]) {
    test('$description [${locale.languageCode}]', () async {
      final l10n = await AppLocalizations.delegate.load(locale);
      body(l10n, locale.languageCode);
    });
  }
}

void expectAllDistinct(List<String> sentences, String language, String subject) {
  for (final sentence in sentences) {
    expect(sentence.trim(), isNotEmpty, reason: '$subject in $language');
  }
  expect(
    sentences.toSet(),
    hasLength(sentences.length),
    reason: 'two members of $subject share one sentence in $language, so a '
        'person is told the same thing about two different situations:\n'
        '${sentences.join('\n')}',
  );
}

void main() {
  group('the vocabulary has no member that could be a promise', () {
    test('RailStanding is exactly these four members', () {
      expect(
        <String>[for (final standing in RailStanding.values) standing.name],
        <String>[
          'subjectEntersIt',
          'subjectUploadsAFile',
          'notBuilt',
          'unknownToThisVersion',
        ],
        reason: 'a member meaning "coming soon", "available later" or '
            '"connect" would let every screen below start making promises. '
            'Adding one has to be a decision made here, in the open.',
      );
    });

    test('ConnectionStatus keeps the three unavailable reasons apart', () {
      expect(
        <String>[for (final status in ConnectionStatus.values) status.name],
        <String>[
          'active',
          'notConfigured',
          'unavailable',
          'retired',
          'notImplemented',
          'unrecognised',
        ],
      );
    });
  });

  inBothLanguages('every lifecycle status has its own sentence', (l10n, language) {
    expectAllDistinct(
      <String>[
        for (final status in ConnectionStatus.values)
          connectionStatusLabel(status, l10n),
      ],
      language,
      'ConnectionStatus',
    );
  });

  inBothLanguages(
    'not set up, not usable now and never built are three different sentences',
    (l10n, language) {
      // The pairwise check the general distinctness test would also catch —
      // stated on its own because this is the one that matters, and a reader of
      // a failure needs to see which distinction was lost.
      final notConfigured =
          connectionStatusLabel(ConnectionStatus.notConfigured, l10n);
      final unavailable =
          connectionStatusLabel(ConnectionStatus.unavailable, l10n);
      final notImplemented =
          connectionStatusLabel(ConnectionStatus.notImplemented, l10n);

      expect(notConfigured, isNot(unavailable), reason: language);
      expect(notConfigured, isNot(notImplemented), reason: language);
      expect(
        unavailable,
        isNot(notImplemented),
        reason: '"off right now" and "never built" are the two a person acts '
            'on differently: one is worth waiting for, the other never is '
            '($language)',
      );
    },
  );

  inBothLanguages('every rail has its own name', (l10n, language) {
    expectAllDistinct(
      <String>[
        for (final rail in ConnectionRail.values) connectionRailLabel(rail, l10n),
      ],
      language,
      'ConnectionRail',
    );
  });

  inBothLanguages('every standing has its own badge and its own sentence',
      (l10n, language) {
    expectAllDistinct(
      <String>[
        for (final standing in RailStanding.values)
          railStandingBadge(standing, l10n),
      ],
      language,
      'RailStanding badges',
    );
    expectAllDistinct(
      <String>[
        for (final standing in RailStanding.values)
          railStandingSentence(standing, l10n),
      ],
      language,
      'RailStanding sentences',
    );
  });

  inBothLanguages('a rail that was never built never borrows a sentence from '
      'one that exists', (l10n, language) {
    final supplied = <String>{
      railStandingSentence(RailStanding.subjectEntersIt, l10n),
      railStandingSentence(RailStanding.subjectUploadsAFile, l10n),
    };
    for (final rail in declaredRails()) {
      final standing = standingOfRail(rail);
      if (standingIsSuppliedBySubject(standing)) {
        continue;
      }
      expect(
        supplied,
        isNot(contains(railStandingSentence(standing, l10n))),
        reason: '$rail must not be described with a sentence that says a '
            'person supplies data through it ($language)',
      );
      expect(
        railStandingSentence(standing, l10n),
        l10n.railStandingNotBuilt,
        reason: '$rail must read as never built ($language)',
      );
    }
  });

  inBothLanguages('every platform availability answer has its own sentence',
      (l10n, language) {
    expectAllDistinct(
      <String>[
        for (final availability in RailAvailability.values)
          railAvailabilityLabel(availability, l10n),
      ],
      language,
      'RailAvailability',
    );
  });

  inBothLanguages('every match basis has its own sentence', (l10n, language) {
    expectAllDistinct(
      <String>[for (final basis in MatchBasis.values) matchBasisLabel(basis, l10n)],
      language,
      'MatchBasis',
    );
  });

  inBothLanguages('every filter, including no filter, has its own name',
      (l10n, language) {
    expectAllDistinct(
      <String>[
        connectionFilterLabel(null, l10n),
        for (final filter in ConnectionStatusFilter.values)
          connectionFilterLabel(filter, l10n),
      ],
      language,
      'ConnectionStatusFilter',
    );
  });

  inBothLanguages('the arrival sentence names the person in both arms',
      (l10n, language) {
    // The two arms must be different sentences, and neither may be the empty
    // string that a missing translation would produce.
    final arrived = sourceArrivalSentence(
      DataArrivedAt(DateTime.utc(2026, 3, 9)),
      l10n,
      formatInstant: (DateTime instant) => '2026-03-09',
    );
    final never = sourceArrivalSentence(
      const NoDataHasArrived(),
      l10n,
      formatInstant: (DateTime instant) => '2026-03-09',
    );
    expectAllDistinct(<String>[arrived, never], language, 'SourceArrival');
    expect(arrived, contains('2026-03-09'), reason: language);
  });
}
