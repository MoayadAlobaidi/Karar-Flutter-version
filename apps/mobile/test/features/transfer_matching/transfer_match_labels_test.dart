// EVERY VOCABULARY MEMBER HAS ITS OWN SENTENCE, IN BOTH LANGUAGES.
//
// The switches in `transfer_match_labels.dart` are exhaustive with no `default`
// arm, so a member added to a vocabulary stops the build until somebody writes
// a sentence for it. That is a compile-time guarantee about COVERAGE and says
// nothing about the sentences themselves — two members mapped to one string
// compile perfectly and tell a person the same thing about two different
// situations.
//
// These tests are the other half: every member's sentence is present, and
// DISTINCT from every other member's, under both shipped locales.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_match.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_matches_repository.dart';
import 'package:karar_mobile/features/transfer_matching/presentation/transfer_match_labels.dart';
import 'package:karar_mobile/features/transfer_matching/presentation/transfer_matching_providers.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

/// Runs [body] under each shipped locale, so a sentence missing from one
/// catalogue is a failure rather than an English-only pass.
void inBothLanguages(
  String description,
  void Function(AppLocalizations l10n, String language) body,
) {
  for (final locale in <Locale>[KararLocalization.english, KararLocalization.arabic]) {
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
    reason:
        'two members of $subject share one sentence in $language, so a '
        'person is told the same thing about two different situations:\n'
        '${sentences.join('\n')}',
  );
}

void main() {
  inBothLanguages('every match state has its own badge word', (l10n, language) {
    expectAllDistinct(
      <String>[for (final state in MatchState.values) matchStateLabel(state, l10n)],
      language,
      'MatchState',
    );
  });

  inBothLanguages('every match state has its own consequence sentence', (l10n, language) {
    expectAllDistinct(
      <String>[for (final state in MatchState.values) matchStateNote(state, l10n)],
      language,
      'MatchState notes',
    );
  });

  inBothLanguages('every suggestion basis has its own sentence', (l10n, language) {
    expectAllDistinct(
      <String>[for (final basis in SuggestionBasis.values) suggestionBasisSentence(basis, l10n)],
      language,
      'SuggestionBasis',
    );
  });

  inBothLanguages('every filter names itself, and its own empty state', (l10n, language) {
    expectAllDistinct(
      <String>[for (final filter in MatchStateFilter.values) matchFilterLabel(filter, l10n)],
      language,
      'MatchStateFilter',
    );
    expectAllDistinct(
      <String>[for (final filter in MatchStateFilter.values) emptyListingTitle(filter, l10n)],
      language,
      'empty titles',
    );
    expectAllDistinct(
      <String>[for (final filter in MatchStateFilter.values) emptyListingDescription(filter, l10n)],
      language,
      'empty descriptions',
    );
  });

  inBothLanguages('an in-flight decision names WHICH decision it is', (l10n, language) {
    expect(decisionProgressStatus(MatchDecisionProgress.idle, l10n), isNull);
    expectAllDistinct(
      <String>[
        decisionProgressStatus(MatchDecisionProgress.confirming, l10n)!,
        decisionProgressStatus(MatchDecisionProgress.rejecting, l10n)!,
      ],
      language,
      'MatchDecisionProgress',
    );
  });

  inBothLanguages('each refusal a person can act on differently reads differently', (
    l10n,
    language,
  ) {
    // A version conflict is retried; an illegal transition is not; a
    // cross-currency pair is neither. Rounding any of them into the others
    // throws away the only part that helps.
    expectAllDistinct(
      <String>[
        decisionRefusalMessage(const ConflictFailure(code: transferMatchVersionConflictCode), l10n),
        decisionRefusalMessage(const ConflictFailure(code: transferMatchRuleViolatedCode), l10n),
        decisionRefusalMessage(const NotFoundFailure(code: transferMatchNotFoundCode), l10n),
        decisionRefusalMessage(
          const InvalidRequestFailure(code: transferMatchCrossCurrencyCode),
          l10n,
        ),
        decisionRefusalMessage(const DependencyUnavailableFailure(), l10n),
      ],
      language,
      'decision refusals',
    );
  });

  inBothLanguages('a client-side transition refusal reads as one', (l10n, _) {
    // The client refuses some answers without sending. The person must be told
    // the same thing the platform would have told them, not "we could not
    // reach the platform" — nothing was even attempted.
    expect(
      decisionRefusalMessage(
        const InvalidRequestFailure(code: transferMatchTransitionUnavailableCode),
        l10n,
      ),
      decisionRefusalMessage(const ConflictFailure(code: transferMatchRuleViolatedCode), l10n),
    );
  });

  inBothLanguages('no state is carried by colour alone', (l10n, _) {
    // The tone is decoration; the word is the state. Every state therefore has
    // a word, and `suggested` is deliberately NEUTRAL rather than a warning or
    // a success — colouring a question would tell a person what to answer.
    expect(matchStateTone(MatchState.suggested), isNot(matchStateTone(MatchState.confirmed)));
    expect(matchStateLabel(MatchState.suggested, l10n).trim(), isNotEmpty);
  });
}
