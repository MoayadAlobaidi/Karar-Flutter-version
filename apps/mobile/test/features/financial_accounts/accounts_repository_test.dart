// THE WIRE, DECODED.
//
// The financial repositories decode the contract themselves rather than
// through the generated DTOs. The first group here is the EVIDENCE for that
// decision: the generated financial DTOs cannot decode a well-formed response
// at all, because the generator emits a field-less class for every named
// string enumeration and then casts the wire's string to a Map.
//
// The rest of the file is the mapping itself: every vocabulary, in both
// directions, plus the shapes that must fail loudly rather than render as an
// empty row.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/models.dart';
import 'package:karar_mobile/features/financial_accounts/data/api_financial_accounts_repository.dart';
import 'package:karar_mobile/features/financial_accounts/data/financial_gateway.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_accounts_repository.dart';
import 'package:karar_mobile/features/financial_accounts/domain/page.dart';

import '../../core/support/fakes.dart';

/// A well-formed account exactly as the contract declares it.
Map<String, Object?> accountBody({
  String accountType = 'CURRENT',
  String? walletKind,
  String nature = 'ASSET',
  String status = 'ACTIVE',
  String origin = 'MANUAL',
  Map<String, Object?>? institution,
  String? userSuppliedInstitutionLabel,
  String? mask = '**1234',
}) =>
    <String, Object?>{
      'accountId': 'account-0001',
      'accountType': accountType,
      'walletKind': walletKind,
      'nature': nature,
      'currency': <String, Object?>{'code': 'QAR', 'exponent': 2},
      'displayName': 'Everyday account',
      'mask': mask,
      'institution': institution,
      'userSuppliedInstitutionLabel': userSuppliedInstitutionLabel,
      'status': status,
      'origin': origin,
      'link': <String, Object?>{
        'state': 'NOT_LINKED',
        'impliesLiveInstitutionLink': false,
        'providerAccessStatus': 'NOT_IMPLEMENTED',
      },
      'createdAt': '2026-01-01T00:00:00.000Z',
      'updatedAt': '2026-02-01T00:00:00.000Z',
      'version': 1,
    };

Map<String, Object?> institutionBody({String kind = 'BANK'}) => <String, Object?>{
      'institutionId': 'issuer-0001',
      'code': 'ISSUER_ONE',
      'kind': kind,
      'displayNameEn': 'First Reviewed Issuer',
      'displayNameAr': 'الجهة المُراجَعة الأولى',
      'status': 'ACTIVE',
    };

Map<String, Object?> pageBody(List<Object?> items) => <String, Object?>{
      'items': items,
      'page': <String, Object?>{
        'limit': 50,
        'returned': items.length,
        'hasMore': false,
        'nextCursor': null,
      },
    };

/// A repository whose transport answers with [body].
({ApiFinancialAccountsRepository repository, FakeApiTransport transport}) repositoryFor(
  Object? body, {
  int statusCode = 200,
}) {
  final transport = FakeApiTransport(
    (ApiRequest request) async => ApiResponse(statusCode: statusCode, body: body),
  );
  return (
    repository: ApiFinancialAccountsRepository(FinancialGateway(transport)),
    transport: transport,
  );
}

Future<FinancialAccount> accountFrom(Map<String, Object?> body) async {
  final result = await repositoryFor(body).repository.readOwnAccount('account-0001');
  return (result as Success<FinancialAccount>).value;
}

void main() {
  group('the generated financial DTOs decode this contract', () {
    // This group used to assert the OPPOSITE, and did so deliberately: the
    // generator emitted a field-less class for every named
    // `type: string, enum: [...]` component and then cast the wire's string to
    // a Map, so a well-formed response threw inside the generated decoder.
    // Twenty vocabularies on this surface are declared that way. The defect was
    // recorded here as an executable fact rather than a comment, precisely so
    // it would fail on the day the generator was fixed. It has been, and these
    // now assert the behaviour that replaced it.
    test('a well-formed account response decodes, and its enums carry values', () {
      final decoded = FinancialAccountViewDto.fromJson(accountBody());
      expect(decoded.accountType, AccountTypeDto.current);
      expect(decoded.accountType.wireValue, 'CURRENT');
    });

    test('an unrecognised wire value falls back rather than throwing', () {
      // A client that threw on a value the server added would break on a
      // deployment it did not ship with.
      expect(AccountTypeDto.fromWire('A_TYPE_THIS_BUILD_HAS_NEVER_SEEN'),
          AccountTypeDto.unknown);
      expect(AccountTypeDto.unknown.toWire(), isNull);
    });

    test('a declared UNKNOWN round-trips instead of serialising as absent', () {
      // AccountNature declares UNKNOWN itself, so the contract's value and the
      // client's fallback are the same member — which is correct, because to a
      // caller they mean the same thing.
      expect(AccountNatureDto.fromWire('UNKNOWN'), AccountNatureDto.unknown);
      expect(AccountNatureDto.unknown.toWire(), 'UNKNOWN');
      expect(AccountNatureDto.fromWire('ASSET'), AccountNatureDto.asset);
    });
  });

  group('the hand-written decoder reads the contract', () {
    test('every account type maps, and an unknown one is unrecognised', () async {
      Future<AccountType> typeFor(String wire) async =>
          (await accountFrom(accountBody(accountType: wire))).accountType;

      expect(await typeFor('CURRENT'), AccountType.current);
      expect(await typeFor('SAVINGS'), AccountType.savings);
      expect(await typeFor('CREDIT_CARD'), AccountType.creditCard);
      expect(await typeFor('CASH'), AccountType.cash);
      expect(await typeFor('WALLET'), AccountType.wallet);
      expect(await typeFor('OTHER'), AccountType.other);
      expect(await typeFor('SOMETHING_NEWER'), AccountType.unrecognised);
    });

    test('every wallet kind maps, and an absent one stays absent', () async {
      expect(
        (await accountFrom(accountBody(accountType: 'WALLET', walletKind: 'E_MONEY')))
            .walletKind,
        WalletKind.eMoney,
      );
      expect((await accountFrom(accountBody())).walletKind, isNull);
      expect(
        (await accountFrom(
          accountBody(accountType: 'WALLET', walletKind: 'SOMETHING_NEWER'),
        ))
            .walletKind,
        WalletKind.unrecognised,
      );
    });

    test('the platform\'s own UNKNOWN nature is not a parse failure', () async {
      expect(
        (await accountFrom(accountBody(nature: 'UNKNOWN'))).nature,
        AccountNature.notStated,
      );
      expect(
        (await accountFrom(accountBody(nature: 'SOMETHING_NEWER'))).nature,
        AccountNature.unrecognised,
      );
    });

    test('every lifecycle and origin maps', () async {
      expect(
        (await accountFrom(accountBody(status: 'ARCHIVED'))).lifecycle,
        AccountLifecycle.archived,
      );
      expect(
        (await accountFrom(accountBody(status: 'CLOSED'))).lifecycle,
        AccountLifecycle.closed,
      );
      expect(
        (await accountFrom(accountBody(origin: 'CSV'))).origin,
        AccountOrigin.csv,
      );
      expect(
        (await accountFrom(accountBody(origin: 'EXTERNAL_PROVIDER'))).origin,
        AccountOrigin.externalProvider,
      );
    });

    test('an issuer is either a catalogue entry or a typed label, never both',
        () async {
      final catalogue =
          await accountFrom(accountBody(institution: institutionBody()));
      expect(catalogue.issuer, isA<IssuerFromCatalogue>());

      final unlisted = await accountFrom(
        accountBody(userSuppliedInstitutionLabel: 'Issuer Entered By Hand'),
      );
      expect(unlisted.issuer, isA<IssuerUnlisted>());

      final none = await accountFrom(accountBody());
      expect(none.issuer, isA<IssuerNotStated>());
    });

    test('the link claim is read from the wire and never inferred', () async {
      final held = await accountFrom(accountBody());
      expect(held.link.impliesLiveInstitutionLink, isFalse);
      expect(held.link.providerAccessImplemented, isFalse);
    });

    test('provider access is false for every token, including unknown ones', () {
      for (final token in <String>[
        'NOT_IMPLEMENTED',
        'IMPLEMENTED',
        'CONNECTED',
        '',
        'anything-a-server-might-add',
      ]) {
        expect(
          providerAccessIsNeverImplemented(token),
          isFalse,
          reason: '"$token" must never be read as a working provider link',
        );
      }
    });

    test('a mask that could be a full number is withheld at the boundary',
        () async {
      final held = await accountFrom(accountBody(mask: '4111111111111111'));
      expect(held.mask.isWithheld, isTrue);
      expect(held.mask.value, isNull);
    });

    test('money keeps its exact characters and the contract exponent', () async {
      final result = await repositoryFor(
        pageBody(<Object?>[
          <String, Object?>{
            'snapshotId': 'snapshot-0001',
            'accountId': 'account-0001',
            'amount': <String, Object?>{
              'minorUnits': '-123456789012345678901234567890',
              'currency': 'BHD',
              'exponent': 3,
            },
            'balanceKind': 'BOOKED',
            'sourceKind': 'CSV',
            'availability': 'EXECUTABLE',
            'asOf': '2026-03-01T12:00:00.000Z',
            'capturedAt': '2026-03-01T13:00:00.000Z',
          },
        ]),
      ).repository.listBalances('account-0001');

      final snapshot = (result as Success<Page<BalanceSnapshot>>).value.items.single;
      expect(snapshot.amount.minorUnits, '-123456789012345678901234567890');
      expect(snapshot.amount.currency, 'BHD');
      // Three, from the response — not two, from a table in the client.
      expect(snapshot.amount.exponent, 3);
    });

    test('a minor-unit value the contract forbids is a stated contract violation',
        () async {
      final result = await repositoryFor(
        pageBody(<Object?>[
          <String, Object?>{
            'snapshotId': 'snapshot-0001',
            'accountId': 'account-0001',
            'amount': <String, Object?>{
              // A float, which the contract never sends and a ledger cannot use.
              'minorUnits': '12.50',
              'currency': 'QAR',
              'exponent': 2,
            },
            'balanceKind': 'BOOKED',
            'sourceKind': 'MANUAL',
            'availability': 'EXECUTABLE',
            'asOf': '2026-03-01T12:00:00.000Z',
            'capturedAt': '2026-03-01T13:00:00.000Z',
          },
        ]),
      ).repository.listBalances('account-0001');

      expect(result.failureOrNull, isA<ContractViolationFailure>());
    });

    test('a source link reads its coverage as days and its freshness as instants',
        () async {
      final result = await repositoryFor(
        pageBody(<Object?>[
          <String, Object?>{
            'sourceLinkId': 'source-link-0001',
            'accountId': 'account-0001',
            'connectionId': 'connection-0001',
            'rail': 'USER_FILE_UPLOAD',
            'availability': 'EXECUTABLE',
            'sourceAuthority': 'AUTHORITATIVE',
            'matchBasis': 'PROBABLE',
            'status': 'LINKED',
            'link': <String, Object?>{
              'impliesLiveInstitutionLink': false,
              'providerAccessStatus': 'NOT_IMPLEMENTED',
            },
            'subjectConfirmedAt': null,
            'sourcePriority': 1,
            'observation': <String, Object?>{
              'firstObservedAt': '2026-01-01T00:00:00.000Z',
              'lastObservedAt': '2026-03-01T00:00:00.000Z',
              'lastSuccessfulImportAt': null,
            },
            'historyCoverage': <String, Object?>{
              'start': '2026-01-01',
              'end': '2026-03-31',
            },
            'capabilities': <String, Object?>{
              'balance': 'OBSERVED',
              'pendingTransactions': 'NOT_PROVIDED',
            },
            'createdAt': '2026-01-01T00:00:00.000Z',
            'updatedAt': '2026-03-01T00:00:00.000Z',
            'version': 1,
          },
        ]),
      ).repository.listSourceLinks('account-0001');

      final link = (result as Success<Page<AccountSourceLink>>).value.items.single;
      expect(link.rail, ConnectionRail.userFileUpload);
      expect(link.historyCoverage!.start.iso8601, '2026-01-01');
      expect(link.historyCoverage!.end.iso8601, '2026-03-31');
      expect(link.observation.lastSuccessfulImportAt, isNull);
      expect(link.impliesLiveInstitutionLink, isFalse);
    });

    test('a malformed shape is a stated failure, never an empty row', () async {
      final missingField = Map<String, Object?>.of(accountBody())..remove('currency');
      final result =
          await repositoryFor(missingField).repository.readOwnAccount('account-0001');
      expect(result.failureOrNull, isA<ContractViolationFailure>());
      expect(
        (result.failureOrNull! as ContractViolationFailure).location,
        'FinancialAccountView.currency',
      );
    });
  });

  group('what the client sends', () {
    test('a manual create carries no origin and no status', () async {
      final held = repositoryFor(accountBody());
      await held.repository.createManualAccount(
        const ManualAccountDraft(
          displayName: 'Everyday account',
          accountType: AccountType.current,
          currencyCode: 'qar',
        ),
      );

      final body = held.transport.requests.single.body! as Map<String, Object?>;
      expect(body.containsKey('origin'), isFalse);
      expect(body.containsKey('status'), isFalse);
      expect(body['currency'], 'QAR');
      expect(body['accountType'], 'CURRENT');
    });

    test('a wallet create carries its kind and a non-wallet carries none', () async {
      final wallet = repositoryFor(accountBody());
      await wallet.repository.createManualAccount(
        const ManualAccountDraft(
          displayName: 'Wallet',
          accountType: AccountType.wallet,
          currencyCode: 'QAR',
          walletKind: WalletKind.payroll,
        ),
      );
      expect(
        (wallet.transport.requests.single.body! as Map<String, Object?>)['walletKind'],
        'PAYROLL',
      );

      final savings = repositoryFor(accountBody());
      await savings.repository.createManualAccount(
        const ManualAccountDraft(
          displayName: 'Savings',
          accountType: AccountType.savings,
          currencyCode: 'QAR',
        ),
      );
      expect(
        (savings.transport.requests.single.body! as Map<String, Object?>)
            .containsKey('walletKind'),
        isFalse,
      );
    });

    test('clearing a field sends an explicit null, and absence leaves it alone',
        () async {
      final held = repositoryFor(accountBody());
      await held.repository.updateAccount(
        'account-0001',
        const AccountEdit(expectedVersion: 3, clearMask: true, displayName: 'Renamed'),
      );

      final body = held.transport.requests.single.body! as Map<String, Object?>;
      expect(body['expectedVersion'], 3);
      expect(body.containsKey('mask'), isTrue);
      expect(body['mask'], isNull);
      // Untouched fields are ABSENT rather than null: the two are different
      // requests and the platform does not conflate them.
      expect(body.containsKey('nature'), isFalse);
      expect(body.containsKey('status'), isFalse);
    });

    test('the currency is never sent on an update', () async {
      final held = repositoryFor(accountBody());
      await held.repository.updateAccount(
        'account-0001',
        const AccountEdit(expectedVersion: 1, displayName: 'Renamed'),
      );
      expect(
        (held.transport.requests.single.body! as Map<String, Object?>)
            .containsKey('currency'),
        isFalse,
        reason: 'the platform refuses a currency change and this client offers none',
      );
    });

    test('a draft the platform would refuse is declined locally', () async {
      final held = repositoryFor(accountBody());
      final create = CreateManualAccount(held.repository);

      final walletWithoutKind = await create(
        const ManualAccountDraft(
          displayName: 'Wallet',
          accountType: AccountType.wallet,
          currencyCode: 'QAR',
        ),
      );
      expect(walletWithoutKind.failureOrNull, isA<InvalidRequestFailure>());
      expect(
        (walletWithoutKind.failureOrNull! as InvalidRequestFailure).fields,
        contains(AccountDraftViolation.walletKindRequired.name),
      );

      final twoIssuers = await create(
        const ManualAccountDraft(
          displayName: 'Account',
          accountType: AccountType.current,
          currencyCode: 'QAR',
          issuerId: 'issuer-0001',
          unlistedIssuerLabel: 'Issuer Entered By Hand',
        ),
      );
      expect(
        (twoIssuers.failureOrNull! as InvalidRequestFailure).fields,
        contains(AccountDraftViolation.issuerNamedTwice.name),
      );

      // Nothing was sent for either.
      expect(held.transport.requests, isEmpty);
    });

    test('an edit that changes nothing is declined without a round trip', () async {
      final held = repositoryFor(accountBody());
      final result =
          await UpdateAccount(held.repository)('account-0001', const AccountEdit(
        expectedVersion: 1,
      ));
      expect(result.failureOrNull?.code, noChangeCode);
      expect(held.transport.requests, isEmpty);
    });

    test('every financial request goes to its contract path', () async {
      final held = repositoryFor(pageBody(<Object?>[]));
      await held.repository.listOwnAccounts();
      await held.repository.listBalances('account-0001');
      await held.repository.listSourceLinks('account-0001');
      await held.repository.listSelectableIssuers();

      expect(
        held.transport.requests.map((ApiRequest request) => request.path).toList(),
        <String>[
          '/financial/accounts',
          '/financial/accounts/account-0001/balances',
          '/financial/accounts/account-0001/source-links',
          '/financial/institutions',
        ],
      );
      for (final request in held.transport.requests) {
        expect(request.requiresAuthentication, isTrue);
        // No operation on this surface accepts a subject or a tenant, and this
        // client sends neither.
        expect(request.query.containsKey('userId'), isFalse);
        expect(request.query.containsKey('tenantId'), isFalse);
      }
    });
  });

  group('reading every page', () {
    test('the listing follows the cursor to the end', () async {
      var call = 0;
      final transport = FakeApiTransport((ApiRequest request) async {
        call++;
        return ApiResponse(
          statusCode: 200,
          body: <String, Object?>{
            'items': <Object?>[accountBody()],
            'page': <String, Object?>{
              'limit': 1,
              'returned': 1,
              'hasMore': call < 3,
              'nextCursor': call < 3 ? 'cursor-$call' : null,
            },
          },
        );
      });

      final result = await LoadOwnAccounts(
        ApiFinancialAccountsRepository(FinancialGateway(transport)),
      )();

      expect((result as Success<List<FinancialAccount>>).value, hasLength(3));
      expect(transport.requests, hasLength(3));
      expect(transport.requests[1].query['cursor'], 'cursor-1');
    });

    test('the walk is bounded, so a server that always says "more" cannot spin',
        () async {
      final transport = FakeApiTransport(
        (ApiRequest request) async => ApiResponse(
          statusCode: 200,
          body: <String, Object?>{
            'items': <Object?>[accountBody()],
            'page': <String, Object?>{
              'limit': 1,
              'returned': 1,
              'hasMore': true,
              'nextCursor': 'cursor-forever',
            },
          },
        ),
      );

      await LoadOwnAccounts(
        ApiFinancialAccountsRepository(FinancialGateway(transport)),
        maximumPages: 4,
      )();

      expect(transport.requests, hasLength(4));
    });
  });
}
