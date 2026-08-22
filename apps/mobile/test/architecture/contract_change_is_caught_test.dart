// A CONTRACT CHANGE IS CAUGHT, NOT ABSORBED.
//
// This is the regression proof for removing the second reading of the
// contract. Before, a financial response was decoded by a hand-written map
// reader with a hand-written vocabulary table beside it, and a contract change
// was ABSORBED: a new enumeration member fell into the table's fallback, a
// renamed field read as absent, and everything compiled and ran. The wrong
// answer was rendered as confidently as a right one.
//
// Now the change has to travel through the generator, and there are three
// gates it hits. This file proves the first two are real and states where the
// third is enforced:
//
//   1. GENERATION. `ContractReader` + `DartEmitter` produce different source
//      for a changed contract, which is exactly what
//      `dart run tool/generate_api_client.dart --check` compares. The tests
//      below run the generator in process over a MUTATED COPY of the real
//      contract and assert the output moves.
//
//   2. COMPILATION. The financial mappers switch exhaustively over the
//      generated enumerations with no default arm, so a member added by
//      regeneration is a compile error until somebody decides what it means.
//      A test cannot add an enum member to a compiled program, so what is
//      asserted here is the property that makes the compile error inevitable:
//      the mapping is TOTAL over the generated vocabulary, and the only member
//      that maps to the domain's `unrecognised` is the generated fallback.
//
//   3. TESTS. The repository suites drive real contract bodies through the
//      generated decoders; a renamed field fails them.
//
// The mutations are applied to a COPY in a temporary directory. Nothing here
// writes to `packages/api-contracts`, and the copy is removed afterwards.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/networking/generated/models.dart';
import 'package:karar_mobile/features/financial_accounts/data/api_financial_accounts_repository.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/money.dart';
import 'package:karar_mobile/features/payment_instruments/data/api_payment_instruments_repository.dart';
import 'package:karar_mobile/features/payment_instruments/domain/payment_instrument.dart';
import 'package:karar_mobile/features/transactions/data/api_transactions_repository.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';

import '../../tool/generate_api_client.dart' as generator;

/// Where the contract lives, relative to `apps/mobile`.
const String contractDirectory = '../../packages/api-contracts/openapi';

/// Copies the contract into [destination] so a mutation cannot touch the real
/// one.
void copyContract(Directory destination) {
  final source = Directory(contractDirectory);
  expect(source.existsSync(), isTrue, reason: 'these tests must run from apps/mobile');
  for (final file in source.listSync(recursive: true).whereType<File>()) {
    final relative = file.path.substring(source.path.length + 1);
    final target = File('${destination.path}/$relative');
    target.parent.createSync(recursive: true);
    target.writeAsStringSync(file.readAsStringSync());
  }
}

/// Generates `models.dart` from the contract rooted at [directory].
String generateModels(Directory directory) {
  final contract = generator.ContractReader('${directory.path}/openapi.yaml').read();
  return generator.DartEmitter(contract).emitModels();
}

/// The source of one generated class, so an assertion about a field lands on
/// the class that declares it rather than anywhere the name happens to appear.
String classBody(String source, String className) {
  final start = source.indexOf('final class $className {');
  expect(start, isNot(-1), reason: '$className is not in the generated source');
  final end = source.indexOf('\n}', start);
  return source.substring(start, end);
}

/// Applies [replacement] for [original] in one contract fragment, failing if
/// the text is not there — a mutation that silently matched nothing would make
/// this whole file prove that generation is stable rather than that it moves.
void mutate(Directory directory, String fragment, String original, String replacement) {
  final file = File('${directory.path}/paths/$fragment');
  final text = file.readAsStringSync();
  expect(
    text.contains(original),
    isTrue,
    reason:
        'the contract no longer contains "$original"; this mutation needs '
        'updating before it proves anything',
  );
  file.writeAsStringSync(text.replaceFirst(original, replacement));
}

void main() {
  group('the generator moves when the contract moves', () {
    late Directory copy;
    late String baseline;

    setUp(() {
      copy = Directory.systemTemp.createTempSync('karar_contract_mutation');
      copyContract(copy);
      baseline = generateModels(copy);
    });

    tearDown(() {
      if (copy.existsSync()) {
        copy.deleteSync(recursive: true);
      }
    });

    test('the unmutated copy reproduces the committed models exactly', () {
      // The control. Without it, a mutation test could pass because the
      // generator is non-deterministic rather than because the contract moved.
      final committed = File('lib/core/networking/generated/models.dart').readAsStringSync();
      expect(baseline, committed);
    });

    test('a new enumeration member reaches the generated enum', () {
      mutate(
        copy,
        'financial-accounts.yaml',
        'enum: [CURRENT, SAVINGS, CREDIT_CARD, CASH, WALLET, OTHER]',
        'enum: [CURRENT, SAVINGS, CREDIT_CARD, CASH, WALLET, OTHER, ESCROW]',
      );
      final mutated = generateModels(copy);

      expect(mutated, isNot(baseline), reason: 'the drift check compares bytes');
      expect(mutated, contains("escrow('ESCROW')"));
      expect(baseline, isNot(contains("escrow('ESCROW')")));
      // And this is the member that would not compile: `accountTypeFromDto`
      // switches over `AccountTypeDto` with no default arm, so a build with
      // `escrow` in the enum has an unhandled case until somebody handles it.
      expect(
        AccountTypeDto.values.map((AccountTypeDto value) => value.name),
        isNot(contains('escrow')),
      );
    });

    test('a renamed field reaches the generated DTO', () {
      mutate(
        copy,
        'financial-shared.yaml',
        'required: [minorUnits, currency, exponent]',
        'required: [minorUnitsExact, currency, exponent]',
      );
      mutate(
        copy,
        'financial-shared.yaml',
        '      minorUnits:\n        type: string',
        '      minorUnitsExact:\n        type: string',
      );
      final mutated = generateModels(copy);

      expect(mutated, isNot(baseline));
      final amount = classBody(mutated, 'MinorUnitAmountDto');
      expect(amount, contains('final String minorUnitsExact;'));
      expect(amount, isNot(contains('final String minorUnits;')));
      // The committed DTO still carries `minorUnits`, which is what the money
      // mapper reads. Regenerating over the mutated contract would leave that
      // read with no field to read, and the analyzer would say so.
      expect(classBody(baseline, 'MinorUnitAmountDto'), contains('final String minorUnits;'));
    });

    test('a field that becomes nullable reaches the generated DTO', () {
      mutate(
        copy,
        'financial-transactions.yaml',
        '      bookingDate:\n        type: string\n        format: date',
        '      bookingDate:\n        type: [string, \'null\']\n        format: date',
      );
      final mutated = generateModels(copy);

      expect(mutated, isNot(baseline));
      // A day that may be absent is a different type, and the mapper that
      // treats it as always present stops compiling.
      expect(classBody(mutated, 'TransactionViewDto'), contains('final String? bookingDate;'));
      expect(classBody(baseline, 'TransactionViewDto'), contains('final String bookingDate;'));
    });
  });

  group('the vocabulary mapping is total, and conservative at the edge', () {
    // Every generated member maps to a domain member, and the ONLY member that
    // maps to the domain's `unrecognised` is the generated fallback. That is
    // what "handle the fallback conservatively" means in practice: a value the
    // platform actually stated never renders as unrecognised, and a value this
    // build cannot read never renders as one it can.

    void assertTotal<D, T>(
      String vocabulary,
      List<D> members,
      D fallback,
      T unrecognised,
      T Function(D) map,
    ) {
      for (final member in members) {
        final mapped = map(member);
        if (member == fallback) {
          expect(
            mapped,
            unrecognised,
            reason:
                '$vocabulary: the generated fallback must map to the '
                "domain's unrecognised member and to nothing else",
          );
        } else {
          expect(
            mapped,
            isNot(unrecognised),
            reason:
                '$vocabulary: "$member" is a value the platform states; '
                'reporting it as unrecognised would hide a real answer',
          );
        }
      }
    }

    test('accounts and wallets', () {
      assertTotal<AccountTypeDto, AccountType>(
        'AccountType',
        AccountTypeDto.values,
        AccountTypeDto.unknown,
        AccountType.unrecognised,
        accountTypeFromDto,
      );
      assertTotal<WalletKindDto, WalletKind>(
        'WalletKind',
        WalletKindDto.values,
        WalletKindDto.unknown,
        WalletKind.unrecognised,
        walletKindFromDto,
      );
      assertTotal<AccountStatusDto, AccountLifecycle>(
        'AccountStatus',
        AccountStatusDto.values,
        AccountStatusDto.unknown,
        AccountLifecycle.unrecognised,
        accountLifecycleFromDto,
      );
      assertTotal<AccountOriginDto, AccountOrigin>(
        'AccountOrigin',
        AccountOriginDto.values,
        AccountOriginDto.unknown,
        AccountOrigin.unrecognised,
        accountOriginFromDto,
      );
      assertTotal<InstitutionKindDto, IssuerKind>(
        'InstitutionKind',
        InstitutionKindDto.values,
        InstitutionKindDto.unknown,
        IssuerKind.unrecognised,
        issuerKindFromDto,
      );
      assertTotal<InstitutionViewStatusDto, IssuerStatus>(
        'InstitutionView.status',
        InstitutionViewStatusDto.values,
        InstitutionViewStatusDto.unknown,
        IssuerStatus.unrecognised,
        issuerStatusFromDto,
      );
    });

    test('a nature the platform declares UNKNOWN is not an unreadable one', () {
      // AccountNature is the one vocabulary where the contract declares its own
      // UNKNOWN, so the generated enum has two members at the edge. They must
      // not collapse: `UNKNOWN` is an answer, and the fallback is the absence
      // of one this build can read.
      assertTotal<AccountNatureDto, AccountNature>(
        'AccountNature',
        AccountNatureDto.values,
        AccountNatureDto.unrecognised,
        AccountNature.unrecognised,
        accountNatureFromDto,
      );
      expect(accountNatureFromDto(AccountNatureDto.unknown), AccountNature.notStated);
      expect(accountNatureFromDto(AccountNatureDto.unrecognised), AccountNature.unrecognised);
    });

    test('rails, balances and links', () {
      assertTotal<BalanceKindDto, BalanceKind>(
        'BalanceKind',
        BalanceKindDto.values,
        BalanceKindDto.unknown,
        BalanceKind.unrecognised,
        balanceKindFromDto,
      );
      assertTotal<SourceKindDto, SourceKind>(
        'SourceKind',
        SourceKindDto.values,
        SourceKindDto.unknown,
        SourceKind.unrecognised,
        sourceKindFromDto,
      );
      assertTotal<RailAvailabilityDto, RailAvailability>(
        'RailAvailability',
        RailAvailabilityDto.values,
        RailAvailabilityDto.unknown,
        RailAvailability.unrecognised,
        railAvailabilityFromDto,
      );
      assertTotal<ConnectionRailDto, ConnectionRail>(
        'ConnectionRail',
        ConnectionRailDto.values,
        ConnectionRailDto.unknown,
        ConnectionRail.unrecognised,
        connectionRailFromDto,
      );
      assertTotal<SourceAuthorityDto, SourceAuthority>(
        'SourceAuthority',
        SourceAuthorityDto.values,
        SourceAuthorityDto.unknown,
        SourceAuthority.unrecognised,
        sourceAuthorityFromDto,
      );
      assertTotal<MatchBasisDto, MatchBasis>(
        'MatchBasis',
        MatchBasisDto.values,
        MatchBasisDto.unknown,
        MatchBasis.unrecognised,
        matchBasisFromDto,
      );
      assertTotal<SourceLinkStatusDto, SourceLinkStatus>(
        'SourceLinkStatus',
        SourceLinkStatusDto.values,
        SourceLinkStatusDto.unknown,
        SourceLinkStatus.unrecognised,
        sourceLinkStatusFromDto,
      );
      assertTotal<SourceCapabilityObservationDto, SourceDataObservationState>(
        'SourceCapabilityObservation',
        SourceCapabilityObservationDto.values,
        SourceCapabilityObservationDto.unknown,
        SourceDataObservationState.unrecognised,
        sourceObservationFromDto,
      );
    });

    test('transactions', () {
      assertTotal<MoneyDirectionDto, MoneyDirection>(
        'MoneyDirection',
        MoneyDirectionDto.values,
        MoneyDirectionDto.unknown,
        MoneyDirection.unrecognised,
        moneyDirectionFromDto,
      );
      assertTotal<TransactionStatusDto, TransactionStatus>(
        'TransactionStatus',
        TransactionStatusDto.values,
        TransactionStatusDto.unknown,
        TransactionStatus.unrecognised,
        transactionStatusFromDto,
      );
      assertTotal<SourceDirectionDto, SourceDirection>(
        'SourceDirection',
        SourceDirectionDto.values,
        SourceDirectionDto.unknown,
        SourceDirection.unrecognised,
        sourceDirectionFromDto,
      );
      assertTotal<DirectionMappingDto, DirectionMapping>(
        'DirectionMapping',
        DirectionMappingDto.values,
        DirectionMappingDto.unknown,
        DirectionMapping.unrecognised,
        directionMappingFromDto,
      );
      assertTotal<RevisionAttributionDto, RevisionAttribution>(
        'RevisionAttribution',
        RevisionAttributionDto.values,
        RevisionAttributionDto.unknown,
        RevisionAttribution.unrecognised,
        revisionAttributionFromDto,
      );
      assertTotal<RevisableFieldDto, RevisableField>(
        'RevisableField',
        RevisableFieldDto.values,
        RevisableFieldDto.unknown,
        RevisableField.unrecognised,
        revisableFieldFromDto,
      );
      assertTotal<AssignmentSourceDto, AssignmentSource>(
        'AssignmentSource',
        AssignmentSourceDto.values,
        AssignmentSourceDto.unknown,
        AssignmentSource.unrecognised,
        assignmentSourceFromDto,
      );
      assertTotal<AssignmentStatusDto, AssignmentStatus>(
        'AssignmentStatus',
        AssignmentStatusDto.values,
        AssignmentStatusDto.unknown,
        AssignmentStatus.unrecognised,
        assignmentStatusFromDto,
      );
      assertTotal<ProvenanceViewCategoryAssignmentSourceDto, CategoryAssignmentOrigin>(
        'ProvenanceView.categoryAssignmentSource',
        ProvenanceViewCategoryAssignmentSourceDto.values,
        ProvenanceViewCategoryAssignmentSourceDto.unknown,
        CategoryAssignmentOrigin.unrecognised,
        categoryAssignmentOriginFromDto,
      );
    });

    test('payment instruments', () {
      assertTotal<InstrumentTypeDto, InstrumentType>(
        'InstrumentType',
        InstrumentTypeDto.values,
        InstrumentTypeDto.unknown,
        InstrumentType.unrecognised,
        instrumentTypeFromDto,
      );
      assertTotal<InstrumentStatusDto, InstrumentStatus>(
        'InstrumentStatus',
        InstrumentStatusDto.values,
        InstrumentStatusDto.unknown,
        InstrumentStatus.unrecognised,
        instrumentStatusFromDto,
      );
    });
  });
}
