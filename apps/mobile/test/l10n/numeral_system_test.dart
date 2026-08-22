// ONE NUMERAL SYSTEM PER SCREEN.
//
// Two things render numbers in this client and they do not share a code path:
//
//   * `KararFormatter`, which formats a value against the locale in the widget
//     tree and then applies `KararNumeralSystem`;
//   * the generated `AppLocalizations`, whose ICU `{count}` placeholders are
//     formatted by `intl.NumberFormat.decimalPattern(localeName)` inside the
//     generated method, where `localeName` is whichever bundle the generator
//     loaded and `KararNumeralSystem` is not consulted at all.
//
// While both paths land on Western digits the divergence is invisible. It stops
// being invisible the moment either input changes: setting the numeral system
// to Arabic-Indic moves the first path and not the second, and a locale whose
// CLDR numbering system is `arab` moves the first path and not the second
// either, because `lookupAppLocalizations` answers `ar_EG` with the `ar`
// bundle. Both produce the same defect — a count in one alphabet beside a date
// in another, on one screen.
//
// `KararFormatter.applyNumerals` closes the gap, and these tests hold it shut.
// Every user-visible number that goes through a generated message is listed in
// [_numericMessages]; each is checked under both shipped locales and under
// every numeral system, and the surfaces themselves are pumped so the checks
// are about what is rendered rather than about what could be.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:karar_mobile/features/mfa/presentation/mfa_enrolment_screen.dart';
import 'package:karar_mobile/features/session_management/presentation/sessions_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../features/authentication/support/identity_harness.dart';
import '../shared/harness.dart';

/// A locale whose CLDR numbering system is `arab` rather than `latn`.
///
/// It is the cheapest way to reproduce the divergence in a test: the generated
/// bundle formats against `ar` and yields Western digits, while the formatter
/// formats against `ar_EG` and yields Arabic-Indic ones. Nothing about the
/// check depends on the product shipping this locale.
const Locale arabicIndicLocale = Locale('ar', 'EG');

/// One user-visible number that is rendered by a generated message.
///
/// [site] is the render site the entry stands for, so a failure names the file
/// to open rather than only the message that broke.
class _NumericMessage {
  const _NumericMessage(this.site, this.render);

  final String site;
  final String Function(AppLocalizations l10n) render;
}

const List<_NumericMessage> _numericMessages = <_NumericMessage>[
  _NumericMessage(
    'shared/design_system/components/karar_text_field.dart (character count)',
    _characterCount,
  ),
  _NumericMessage(
    'shared/design_system/components/karar_navigation_bar.dart (tab position)',
    _tabPosition,
  ),
  _NumericMessage(
    'features/authentication/.../identity_failure_messages.dart (too short)',
    _passwordTooShort,
  ),
  _NumericMessage(
    'features/authentication/.../identity_failure_messages.dart (too long)',
    _passwordTooLong,
  ),
  _NumericMessage(
    'features/session_management/presentation/sessions_screen.dart (revoked)',
    _revokedOthers,
  ),
  _NumericMessage(
    'features/mfa/presentation/mfa_enrolment_screen.dart (code position)',
    _recoveryCodePosition,
  ),
];

String _characterCount(AppLocalizations l10n) => l10n.fieldCharacterCount(3, 20);
String _tabPosition(AppLocalizations l10n) => l10n.a11yTabPosition(2, 5);
String _passwordTooShort(AppLocalizations l10n) => l10n.passwordTooShort(12);
String _passwordTooLong(AppLocalizations l10n) => l10n.passwordTooLong(128);
String _revokedOthers(AppLocalizations l10n) => l10n.sessionsRevokedOthersNotice(3);
String _recoveryCodePosition(AppLocalizations l10n) => l10n.a11yRecoveryCodePosition(1, 10);

bool _containsWesternDigits(String value) => RegExp('[0-9]').hasMatch(value);

/// Wraps [child] in the locale a test wants, reusing the delegates the harness
/// already installed. `MaterialApp.localeResolutionCallback` narrows every
/// Arabic locale to bare `ar`, so an override is the only way to mount a
/// subtree under a region-specific one.
Widget _inLocale(Locale locale, Widget child) {
  return Builder(
    builder: (BuildContext context) =>
        Localizations.override(context: context, locale: locale, child: child),
  );
}

void main() {
  // The date methods below resolve symbol data for the locale they are given;
  // outside a widget tree nothing has installed it yet.
  setUpAll(initializeDateFormatting);

  final AppLocalizations english = lookupAppLocalizations(KararLocalization.english);
  final AppLocalizations arabic = lookupAppLocalizations(KararLocalization.arabic);
  final Map<Locale, AppLocalizations> catalogues = <Locale, AppLocalizations>{
    KararLocalization.english: english,
    KararLocalization.arabic: arabic,
  };

  group('generated messages follow the formatter, not the bundle', () {
    for (final MapEntry<Locale, AppLocalizations> entry in catalogues.entries) {
      final String language = entry.key.languageCode;

      test('[$language] Arabic-Indic leaves no Western digit behind', () {
        final KararFormatter formatter = KararFormatter(
          locale: entry.key,
          numerals: KararNumeralSystem.arabicIndic,
        );
        for (final _NumericMessage message in _numericMessages) {
          final String rendered = formatter.applyNumerals(message.render(entry.value));
          expect(
            ArabicNumerals.containsArabicIndicDigits(rendered),
            isTrue,
            reason: '${message.site} rendered "$rendered"',
          );
          expect(
            _containsWesternDigits(rendered),
            isFalse,
            reason:
                '${message.site} rendered "$rendered", which mixes a Western '
                'digit into a screen whose other numbers are Arabic-Indic.',
          );
        }
      });

      test('[$language] Western leaves no Arabic-Indic digit behind', () {
        final KararFormatter formatter = KararFormatter(
          locale: entry.key,
          numerals: KararNumeralSystem.western,
        );
        for (final _NumericMessage message in _numericMessages) {
          final String rendered = formatter.applyNumerals(message.render(entry.value));
          expect(
            _containsWesternDigits(rendered),
            isTrue,
            reason: '${message.site} rendered "$rendered"',
          );
          expect(
            ArabicNumerals.containsArabicIndicDigits(rendered),
            isFalse,
            reason:
                '${message.site} rendered "$rendered", which mixes an '
                'Arabic-Indic digit into a Western screen.',
          );
        }
      });

      test('[$language] a count and a date agree on their digits', () {
        for (final KararNumeralSystem system in KararNumeralSystem.values) {
          final KararFormatter formatter = KararFormatter(locale: entry.key, numerals: system);
          final String date = formatter.dateTime(DateTime(2026, 8, 16, 14, 30));
          final bool dateIsArabicIndic = ArabicNumerals.containsArabicIndicDigits(date);
          for (final _NumericMessage message in _numericMessages) {
            final String rendered = formatter.applyNumerals(message.render(entry.value));
            expect(
              ArabicNumerals.containsArabicIndicDigits(rendered),
              dateIsArabicIndic,
              reason:
                  '${message.site} under $system rendered "$rendered" beside '
                  'the timestamp "$date".',
            );
          }
        }
      });

      test('[$language] the shipped default changes nothing', () {
        // The product ships `KararNumeralSystem.locale`, and CLDR gives both
        // `en` and bare `ar` the `latn` numbering system. Routing a message
        // through the formatter must therefore be byte-for-byte invisible
        // today; if it is not, the fix has changed shipped copy.
        final KararFormatter formatter = KararFormatter(locale: entry.key);
        for (final _NumericMessage message in _numericMessages) {
          final String raw = message.render(entry.value);
          expect(
            formatter.applyNumerals(raw),
            raw,
            reason: '${message.site} changed under the shipped default',
          );
        }
      });
    }

    test('a bundle formatted for a coarser locale is corrected', () {
      // `lookupAppLocalizations` matches on the language subtag, so the `ar`
      // bundle serves `ar_EG` and formats its placeholders against `ar` —
      // Western digits — while the formatter formats against `ar_EG` and
      // produces Arabic-Indic ones. This is the divergence with no override
      // set at all.
      const KararFormatter formatter = KararFormatter(locale: arabicIndicLocale);
      expect(
        ArabicNumerals.containsArabicIndicDigits(formatter.integer(1234567)),
        isTrue,
        reason: 'CLDR gives ar_EG the arab numbering system',
      );
      for (final _NumericMessage message in _numericMessages) {
        final String raw = message.render(arabic);
        expect(
          _containsWesternDigits(raw),
          isTrue,
          reason: 'the generated bundle is the Western half of the divergence',
        );
        final String rendered = formatter.applyNumerals(raw);
        expect(
          _containsWesternDigits(rendered),
          isFalse,
          reason: '${message.site} rendered "$rendered"',
        );
      }
    });
  });

  group('surfaces', () {
    testWidgets('the character counter follows the formatter', (WidgetTester tester) async {
      await pumpKarar(
        tester,
        _inLocale(arabicIndicLocale, const KararTextField(label: 'Nickname', maxLength: 20)),
        locale: KararLocalization.arabic,
      );

      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararTextField)),
      );
      final String bundleText = l10n.fieldCharacterCount(0, 20);
      expect(
        _containsWesternDigits(bundleText),
        isTrue,
        reason: 'the ar bundle serves ar_EG and formats against ar',
      );
      expect(
        find.text(ArabicNumerals.toArabicIndic(bundleText)),
        findsOneWidget,
        reason:
            'The counter must use the same digits as every other number the '
            'formatter renders under this locale.',
      );
      expect(find.text(bundleText), findsNothing);
    });

    testInBothDirections('the character counter carries one alphabet only', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      await pumpKarar(
        tester,
        const KararTextField(label: 'Nickname', maxLength: 20),
        locale: locale,
      );
      final List<String> rendered = tester
          .widgetList<Text>(find.byType(Text))
          .map((Text text) => text.data ?? '')
          .where((String value) => value.isNotEmpty)
          .toList();
      expect(
        rendered.where(ArabicNumerals.containsArabicIndicDigits).toList(),
        isEmpty,
        reason:
            'Both shipped locales resolve to the latn numbering system, so an '
            'Arabic-Indic digit here would disagree with every date on screen.',
      );
      expect(
        rendered.any(_containsWesternDigits),
        isTrue,
        reason: 'the counter has to be on screen for this to prove anything',
      );
    });

    testWidgets('the tab position hint follows the formatter', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpKarar(
        tester,
        _inLocale(
          arabicIndicLocale,
          KararNavigationBar(
            destinations: const <KararNavigationDestination>[
              KararNavigationDestination(icon: Icons.home_outlined, label: 'Home'),
              KararNavigationDestination(icon: Icons.settings_outlined, label: 'Settings'),
            ],
            selectedIndex: 1,
            onDestinationSelected: (_) {},
          ),
        ),
        locale: KararLocalization.arabic,
      );

      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararNavigationBar)),
      );
      expect(
        tester.getSemantics(find.bySemanticsLabel('Settings')),
        isSemantics(
          isSelected: true,
          isButton: true,
          hasTapAction: true,
          hint: ArabicNumerals.toArabicIndic(l10n.a11yTabPosition(2, 2)),
        ),
        reason: 'The position is spoken as a number and takes the same digits.',
      );
      handle.dispose();
    });

    testWidgets('the revoked-devices notice follows the formatter', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(KararLocalization.arabic);
      harness.transport.onGet('/auth/sessions', sessionListPayload(others: 3));
      harness.transport.onPost('/auth/sessions/revoke-others', <String, Object?>{
        'status': 'revoked',
        'revokedCount': 3,
      });

      await pumpIdentity(
        tester,
        _inLocale(arabicIndicLocale, const SessionsScreen()),
        harness: harness,
        locale: KararLocalization.arabic,
      );
      await tester.pumpAndSettle();

      await tapIdentityButton(tester, l10n.sessionsRevokeOthersAction);
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.sessionsRevokeOthersAction).last);
      await tester.pumpAndSettle();

      final String bundleText = l10n.sessionsRevokedOthersNotice(3);
      expect(_containsWesternDigits(bundleText), isTrue);
      expect(
        find.text(ArabicNumerals.toArabicIndic(bundleText)),
        findsOneWidget,
        reason:
            'The count sits directly above timestamps the formatter rendered; '
            'the two cannot use different alphabets.',
      );
      expect(find.text(bundleText), findsNothing);
    });

    testWidgets('the recovery-code position follows the formatter', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(KararLocalization.arabic);
      harness.transport.onPost('/auth/mfa/enroll', <String, Object?>{
        'status': 'enrolment_started',
        'secret': 'JBSWY3DPEHPK3PXP',
        'otpauthUrl': 'otpauth://totp/Karar:person?secret=JBSWY3DPEHPK3PXP',
      });
      harness.transport.onPost('/auth/mfa/confirm', <String, Object?>{
        'status': 'confirmed',
        'recoveryCodes': <String>['AAAA-1111', 'BBBB-2222'],
      });

      await pumpIdentity(
        tester,
        _inLocale(arabicIndicLocale, const MfaEnrolmentScreen()),
        harness: harness,
        locale: KararLocalization.arabic,
      );
      await tapIdentityButton(tester, l10n.mfaEnrolStartAction);
      await tester.pumpAndSettle();
      await enterIdentityField(tester, 0, '123456');
      await tapIdentityButton(tester, l10n.mfaConfirmAction);
      await tester.pumpAndSettle();

      final String bundleText = l10n.a11yRecoveryCodePosition(1, 2);
      expect(_containsWesternDigits(bundleText), isTrue);
      expect(
        find.bySemanticsLabel(ArabicNumerals.toArabicIndic(bundleText)),
        findsOneWidget,
        reason:
            'The position is read aloud as a number, so a screen reader must '
            'not switch alphabets between one row and the next.',
      );
      expect(find.bySemanticsLabel(bundleText), findsNothing);
      handle.dispose();
    });
  });
}
