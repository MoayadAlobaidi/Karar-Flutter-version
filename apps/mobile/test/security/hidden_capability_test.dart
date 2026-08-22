// HIDDEN CAPABILITIES ARE ABSENT FROM THIS CLIENT, NOT SWITCHED OFF IN IT.
//
// The platform's capability model distinguishes capabilities a client may be
// told about from capabilities it may not. Amanat — sealed after-death
// information handover — is the canonical hidden capability: the client-safe
// resolver never emits it in any state, and no client-side surface should be
// able to name it, request it, or reveal by its absence that it exists.
//
// The security property is STRUCTURAL. "The partner must never see Amanat"
// holds because there is nothing in the client that refers to it, not because
// a flag is false somewhere. A test is the only thing that keeps it that way
// once several workstreams are adding features in parallel.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/networking/generated/models.dart';

import 'support/source_tree.dart';

/// Capability identifiers the client must never contain.
///
/// Only hidden capabilities belong here. A capability the client is allowed to
/// render (transactions, budgets, goals) must NOT be listed: this is a test
/// about non-disclosure, not a vocabulary ban.
const List<String> _hiddenCapabilityNames = <String>[
  'amanat',
  'sealed_vault',
  'sealedvault',
];

/// COMMENTS ARE NOT SCANNED, STRING LITERALS ARE.
///
/// The line this suite draws is what ends up in the shipped binary. A comment
/// explaining why an identifier is withheld is compiled away and discloses
/// nothing to anyone holding the APK; a string literal is readable with
/// `unzip` and `strings`. So assertions run against comment-stripped source.
///
/// THE ONE RECORDED EXCEPTION
///
/// ADR-0016 is now satisfied structurally rather than by filtering. The
/// platform-bootstrap workstream previously declared a client-side denylist
/// containing a withheld identifier; the lead removed it, because shipping the
/// literal told anyone who unpacked the binary that a capability by that name
/// exists and is deliberately withheld — more than silence says, and exactly
/// the disclosure the hidden-capability design prevents. A denylist also only
/// protects the names someone thought to write down.
///
/// Navigation is now allowlist-driven: the client renders what the server's
/// client-safe view returns and nothing else, and an unregistered identifier
/// produces no destination. There is therefore NO scoped exception left — a
/// withheld identifier appearing anywhere in compiled content fails outright.

/// Capability identifiers the server registry defines. A client-side enum that
/// writes any of these down is an inventory of what the platform can do,
/// hidden entries included, and drifts from the registry the moment either
/// changes. These are the names, not a capability model — the client still
/// treats a capability as an opaque identifier it was handed.
const List<String> _knownCapabilityIdentifiers = <String>[
  'TRANSACTIONS',
  'BUDGETS',
  'GOALS',
  'ZAKAT',
  'AMANAT',
  'INSIGHTS',
  'DOCUMENTS',
  'SEALED_VAULT',
];

void main() {
  group('no hidden capability is named anywhere in the client', () {
    // SCOPE: lib, android and ios — the surfaces that are COMPILED INTO THE
    // SHIPPED BINARY. `test/` and `tool/` are excluded on purpose: neither is
    // distributed, and a test that proves a capability is withheld has to be
    // able to name the capability it is withholding. The property under test
    // is what an attacker can read out of the installed app, not what the word
    // "amanat" appears next to in the repository.
    test('no withheld identifier reaches compiled content', () {
      final offenders = <String>[];
      for (final file in readSourceFiles(<String>['lib', 'android', 'ios'])) {
        final body = isCodeLikePath(file.relativePath)
            ? stripCodeComments(file.contents)
            : file.contents;

        final haystack = body.toLowerCase();
        for (final name in _hiddenCapabilityNames) {
          if (haystack.contains(name)) {
            offenders.add('${file.relativePath}: $name');
          }
        }
      }

      expect(
        offenders,
        isEmpty,
        reason: 'a withheld capability identifier must not be compiled into this '
            'client — not in a string table, a localisation catalogue, a route name '
            'or a test fixture. Naming it is enough to disclose that it exists. '
            'Found: $offenders',
      );
    });

    test('the client declares no enumeration of capabilities', () {
      // An enum LISTING capabilities would be a published inventory of
      // everything the platform can do, hidden entries included, and would
      // drift from the server registry the moment either changed. An enum
      // describing the STATE of a capability (resolved, unavailable) is a
      // different thing and is fine.
      const List<String> stateSuffixes = <String>[
        'State',
        'Status',
        'Kind',
        'Mode',
        'Phase',
        'Resolution',
      ];

      final offenders = <String>[];
      for (final file in readSourceFiles(<String>['lib'])) {
        final body = stripCodeComments(file.contents);
        for (final match in RegExp(r'enum\s+(\w*Capabilit\w*)\b').allMatches(body)) {
          final name = match.group(1)!;
          // Generated contract types carry a Dto suffix; judge the name under
          // it, so CapabilitiesSectionStateDto reads as a State enum.
          final bare = name.endsWith('Dto')
              ? name.substring(0, name.length - 'Dto'.length)
              : name;
          final describesState =
              stateSuffixes.any((String suffix) => bare.endsWith(suffix));
          // Judge the MEMBERS, not just the name. An inventory lists capability
          // identifiers; SourceCapabilityObservation lists OBSERVED,
          // NOT_OBSERVED and NOT_PROVIDED — an observation about one source,
          // which discloses no capability at all. Naming alone flagged it the
          // moment the generator began emitting enum members, and a suffix
          // allow-list would have to grow with every new noun. What actually
          // matters is whether a capability identifier is written down here.
          final memberBlock = RegExp('enum\\s+$name\\b[^{]*\\{([^}]*)\\}').firstMatch(body);
          final listsCapabilityIdentifiers = memberBlock != null &&
              _knownCapabilityIdentifiers
                  .any((String id) => memberBlock.group(1)!.contains(id));
          if (!describesState && listsCapabilityIdentifiers) {
            offenders.add('${file.relativePath}: $name');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'capabilities are resolved by the server and passed through as opaque '
            'identifiers. Found a client-side inventory in: $offenders',
      );
    });

    test('a capability view carries only what the contract passes through', () {
      // The client models a capability as three opaque fields. It cannot infer
      // the existence of anything the server did not send, because there is no
      // local list to compare against.
      const view = CapabilityViewDto(
        id: 'TRANSACTIONS',
        requirements: <CapabilityViewRequirementsItemDto>[],
        status: 'AVAILABLE',
      );
      expect(view.toJson().keys.toSet(), <String>{'id', 'requirements', 'status'});
    });
  });

  group('generated DTOs never render their contents', () {
    test('every DTO toString prints the type name only', () {
      // A DTO routinely carries an e-mail address, a display name, an
      // identifier or a capability id. An interpolated toString is the easiest
      // way for any of that to reach a log line or a framework error dump.
      final models = readRequiredFile('lib/core/networking/generated/models.dart');

      final renderings = RegExp(r"String toString\(\) => '([^']*)';")
          .allMatches(models)
          .map((RegExpMatch match) => match.group(1)!)
          .toList(growable: false);

      expect(
        renderings,
        isNotEmpty,
        reason: 'the generated models must define toString',
      );
      for (final rendering in renderings) {
        expect(
          RegExp(r'^\w+\(\)$').hasMatch(rendering),
          isTrue,
          reason: '"$rendering" interpolates field content into a string',
        );
      }
    });

    test('no DTO toString interpolates a field', () {
      final models = readRequiredFile('lib/core/networking/generated/models.dart');
      final interpolating = RegExp(r"String toString\(\) => '[^']*\$")
          .allMatches(models)
          .length;
      expect(
        interpolating,
        0,
        reason: 'a generated toString must not interpolate contract data',
      );
    });
  });
}
