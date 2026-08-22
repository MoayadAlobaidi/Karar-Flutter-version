// A FAILURE THE SERVER CANNOT SEND IS NOT A PROTECTION.
//
// The client maps `CONSENT_REQUIRED` and `RE_CONSENT_REQUIRED` onto
// `ConsentRequiredFailure` and `ReConsentRequiredFailure`. Reading the client
// alone, a person would reasonably conclude that consent gates access to
// financial data. It does not, and nothing in this repository makes it so:
//
//   * no server path emits either code — `apps/api/src` contains neither;
//   * the OpenAPI document declares neither as a problem code. It declares
//     `RECONSENT_REQUIRED`, which is a different thing entirely: the STATUS of
//     a grant, returned in a 200 body by the consent surface itself;
//   * consent is not a startup stage, so no gate routes to it;
//   * `/consent` is an ordinary protected route.
//
// This test does not add a consent gate. Whether consent should block
// financial processing is a legal question with a jurisdiction and a
// PolicyPack behind it, and `qa/v1` clears nothing — inventing the gate here
// would be fabricating a legal decision.
//
// What it does is stop the taxonomy from reading as a control that exists. The
// mapping stays, because it is the seam the real gate will use; the day the
// server starts emitting the code, THIS test fails, and whoever added it has
// to wire the gate, the state discard and the deep-link block at the same
// time rather than discovering later that the client quietly swallowed it.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String repoFile(String relative) =>
    File('${Directory.current.path}/../../$relative').readAsStringSync();

void main() {
  group('the consent-required taxonomy is a seam, not a live control', () {
    test('the contract declares no CONSENT_REQUIRED problem code', () {
      final merged = repoFile('packages/api-contracts/openapi/openapi.yaml');
      final consent = repoFile('packages/api-contracts/openapi/paths/consent.yaml');

      for (final document in <String>[merged, consent]) {
        // RECONSENT_REQUIRED is a grant STATUS in a 200 body. Excluding it is
        // the point of the check, not a loophole in it.
        final withoutStatus = document.replaceAll('RECONSENT_REQUIRED', '');
        expect(withoutStatus.contains('CONSENT_REQUIRED'), isFalse);
      }
    });

    test('no server path emits either code', () {
      final api = Directory('${Directory.current.path}/../../apps/api/src');
      final offenders = <String>[];
      for (final entity in api.listSync(recursive: true)) {
        if (entity is! File || !entity.path.endsWith('.ts')) continue;
        if (entity.path.contains('/dist/')) continue;
        final source = entity.readAsStringSync().replaceAll('RECONSENT_REQUIRED', '');
        if (source.contains('CONSENT_REQUIRED')) offenders.add(entity.path);
      }
      expect(
        offenders,
        isEmpty,
        reason:
            'the server now emits a consent-required code. That is a real '
            'gate arriving: route it in the startup machine, discard financial '
            'state behind it, block the deep links, and delete this test.',
      );
    });

    test('consent is not a startup stage, and this says so out loud', () {
      final startup = repoFile('apps/mobile/lib/app/lifecycle/startup_state.dart');
      // If a consent stage is ever added, the sentence above stops being true
      // and this fails — which is the reminder to revisit the whole group.
      expect(startup.toLowerCase().contains('consent'), isFalse);
    });
  });
}
