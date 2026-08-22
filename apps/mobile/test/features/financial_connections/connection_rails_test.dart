// THE RULES ABOUT RAILS, ASSERTED OVER THE WHOLE VOCABULARY.
//
// Every test in this file iterates a `.values` list rather than naming the
// members somebody remembered. That is the difference between "manual and file
// upload behave correctly" and "no rail can behave incorrectly": a fourteenth
// rail added to the contract is covered the moment it is generated, without
// anyone editing this file.
//
// The properties proved here are the ones the whole surface rests on:
//
//   * exactly two rails are supplied by the person, and every other one is
//     `notBuilt`. Not "pending", not "unavailable" — the vocabulary has no
//     member that could mean either;
//   * NO STANDING INVITES A CONNECTION, over the whole of `RailStanding.values`;
//   * availability cannot GRANT a capability. A response claiming a bank rail
//     is EXECUTABLE leaves the standing exactly where it was;
//   * the contradiction detector fires on both directions of drift, and stays
//     silent for the two vocabularies this build cannot compare.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/source_rail.dart';
import 'package:karar_mobile/features/financial_connections/domain/rail_standing.dart';
import 'package:karar_mobile/features/financial_connections/domain/source_arrival.dart';

import 'support/financial_connections_harness.dart';

/// The two rails the platform actually implements, and the ONLY two.
const Set<ConnectionRail> suppliedRails = <ConnectionRail>{
  ConnectionRail.manual,
  ConnectionRail.userFileUpload,
};

void main() {
  group('the vocabulary itself', () {
    test('every declared rail is covered, and the client-only member is not', () {
      // Without this the iterations below could be over an empty list.
      expect(declaredRails(), hasLength(ConnectionRail.values.length - 1));
      expect(declaredRails(), isNot(contains(ConnectionRail.unrecognised)));
      expect(declaredRails(), containsAll(suppliedRails));
    });

    test('exactly two rails are supplied by the person', () {
      final supplied = <ConnectionRail>{
        for (final rail in ConnectionRail.values)
          if (standingIsSuppliedBySubject(standingOfRail(rail))) rail,
      };
      expect(
        supplied,
        suppliedRails,
        reason:
            'MANUAL and USER_FILE_UPLOAD are the only rails this platform '
            'has built (ADR-0028). A third would have to be a deliberate edit '
            'here, not a side effect somewhere else.',
      );
    });

    test('every other declared rail is NOT BUILT, never merely unavailable', () {
      for (final rail in declaredRails()) {
        if (suppliedRails.contains(rail)) {
          continue;
        }
        expect(
          standingOfRail(rail),
          RailStanding.notBuilt,
          reason:
              '$rail must read as never built. "Pending", "unavailable" '
              'and "coming soon" are all promises, and the vocabulary has no '
              'member for any of them.',
        );
      }
    });

    test('a rail this build does not know is named as unknown, never guessed', () {
      expect(standingOfRail(ConnectionRail.unrecognised), RailStanding.unknownToThisVersion);
      expect(
        standingIsSuppliedBySubject(RailStanding.unknownToThisVersion),
        isFalse,
        reason:
            'a rail nobody in this build can describe is not evidence that '
            'the person supplied anything through it',
      );
    });
  });

  group('no standing invites a connection', () {
    test('over the WHOLE vocabulary, not the members somebody remembered', () {
      expect(RailStanding.values, isNotEmpty);
      for (final standing in RailStanding.values) {
        expect(
          standingInvitesConnection(standing),
          isFalse,
          reason:
              '$standing must not assert that this platform can reach an '
              'institution. No issuer exposes an interface to it and no '
              'credential of any kind is stored.',
        );
      }
    });
  });

  group('availability cannot grant a capability', () {
    test('a bank rail claiming EXECUTABLE is still not built', () {
      // This is the response an over-eager backend, or a hostile one, would
      // send. The screen derives everything from the rail, so the claim buys
      // nothing.
      for (final rail in declaredRails()) {
        if (suppliedRails.contains(rail)) {
          continue;
        }
        expect(standingOfRail(rail), RailStanding.notBuilt, reason: '$rail');
        expect(standingIsSuppliedBySubject(standingOfRail(rail)), isFalse);
      }
    });
  });

  group('the contradiction detector', () {
    test('fires when a rail this platform never built claims to run', () {
      for (final rail in declaredRails()) {
        if (suppliedRails.contains(rail)) {
          continue;
        }
        expect(
          railContradictsAvailability(rail, RailAvailability.executable),
          isTrue,
          reason:
              '$rail reported as EXECUTABLE is drift about the one field '
              'that separates "you typed this in" from "an institution sent it"',
        );
      }
    });

    test('fires when a rail this platform DID build claims not to be built', () {
      for (final rail in suppliedRails) {
        expect(
          railContradictsAvailability(rail, RailAvailability.notImplemented),
          isTrue,
          reason: '$rail is EXECUTABLE by contract and by database constraint',
        );
      }
    });

    test('stays silent for the split the contract actually states', () {
      for (final rail in declaredRails()) {
        final RailAvailability stated = suppliedRails.contains(rail)
            ? RailAvailability.executable
            : RailAvailability.notImplemented;
        expect(
          railContradictsAvailability(rail, stated),
          isFalse,
          reason: '$rail with $stated is exactly what the contract permits',
        );
      }
    });

    test('makes no claim about a rail this build does not know', () {
      // A newer platform implementing a fourteenth rail is a deployment, not a
      // defect. An older client that refused it would break on an upgrade it
      // did not ship for.
      for (final availability in RailAvailability.values) {
        expect(
          railContradictsAvailability(ConnectionRail.unrecognised, availability),
          isFalse,
          reason: 'an unknown rail with $availability must not be refused',
        );
      }
    });

    test('makes no claim about an availability this build does not know', () {
      for (final rail in ConnectionRail.values) {
        expect(
          railContradictsAvailability(rail, RailAvailability.unrecognised),
          isFalse,
          reason: 'there is nothing to compare $rail against',
        );
      }
    });
  });

  group('when data arrived, and the fields that are not that', () {
    test('one successful import is the arrival, verbatim', () {
      final landed = DateTime.utc(2026, 5, 6, 7, 8);
      expect(
        arrivalOf(
          SourceObservation(
            firstObservedAt: DateTime.utc(2026),
            lastObservedAt: DateTime.utc(2026, 6),
            lastSuccessfulImportAt: landed,
          ),
        ),
        DataArrivedAt(landed),
      );
    });

    test('being SEEN is not having ARRIVED', () {
      // The trap: `lastObservedAt` is set and recent, and nothing has landed. A
      // surface that fell back to it would show a confident, wrong date.
      expect(
        arrivalOf(
          SourceObservation(
            firstObservedAt: DateTime.utc(2026),
            lastObservedAt: DateTime.utc(2026, 9, 30),
            lastSuccessfulImportAt: null,
          ),
        ),
        const NoDataHasArrived(),
      );
    });

    test('a coverage range cannot masquerade as an arrival', () {
      // The trap this file exists to close at the domain level: a source whose
      // supplied data covers up to yesterday, and through which nothing has
      // ever landed. `arrivalOf` takes the OBSERVATION, so the coverage range
      // is not even in scope where the decision is made — an edit that wanted
      // to reach for it would have to change the signature first.
      final link = sourceLinkFixture(
        historyCoverage: coverage('2026-01-01', '2026-09-30'),
        lastObservedAt: DateTime.utc(2026, 9, 30),
      );
      expect(link.historyCoverage, isNotNull);
      expect(arrivalOf(link.observation), const NoDataHasArrived());
    });
  });
}
