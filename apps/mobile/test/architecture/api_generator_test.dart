// WHAT THE GENERATOR MODELS, PROVEN ON A SYNTHETIC CONTRACT.
//
// Three defects were fixed in `tool/generate_api_client.dart` while the
// financial data layer was moved onto the generated client. Each was found the
// same way — the generated client could not express something the contract
// states — and each is asserted here against a small contract written for the
// purpose, so the rule is proven rather than the one instance of it.
//
//   1. A NAMED SCALAR COMPONENT IS AN ALIAS, NOT A CLASS.
//      `CategoryCode: { type: string, pattern: ... }` became a field-less DTO
//      whose `fromJson` cast the wire's string to a Map. Every category
//      response threw inside the generated decoder.
//
//   2. AN OPTIONAL FIELD IS OMITTED; A NULLABLE ONE CAN BE SENT AS NULL.
//      `toJson` wrote every key, so a PATCH naming one field asked the
//      platform to consider all of them, and a field the contract lets a
//      caller CLEAR could not be told apart from one they never mentioned.
//
//   3. AN ENUMERATION QUERY PARAMETER TRAVELS AS ITS WIRE VALUE.
//      The Dart enum was handed to the transport, which rendered it with
//      `toString()` and sent `MoneyDirectionDto.moneyOut` where the contract
//      says `MONEY_OUT`.
//
// The generator is run in process over a contract written into a temporary
// directory, so nothing here reads or writes `packages/api-contracts`.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../../tool/generate_api_client.dart' as generator;

/// A contract in the dialect the real one is written in, small enough to read
/// whole, carrying one example of every shape under test.
const String syntheticContract = '''
openapi: 3.1.0
info:
  title: Synthetic
  version: 0.0.1
components:
  Grade:
    type: string
    pattern: '^[A-Z]+\$'
    description: A named SCALAR component. An alias with a constraint.
  Colour:
    type: string
    enum: [RED, GREEN]
paths:
  /things:
    get:
      operationId: listThings
      parameters:
        - name: colour
          in: query
          required: false
          schema:
            \$ref: '#/components/Colour'
        - name: since
          in: query
          required: false
          schema: { type: string, format: date-time }
      responses:
        '200':
          description: The things.
          content:
            application/json:
              schema:
                type: object
                additionalProperties: false
                required: [grade]
                properties:
                  grade:
                    \$ref: '#/components/Grade'
                  note: { type: [string, 'null'] }
  /things/{thingId}/source:
    post:
      operationId: uploadThingSource
      parameters:
        - name: thingId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          text/csv:
            schema: { type: string }
      responses:
        '200':
          description: The thing.
          content:
            application/json:
              schema:
                type: object
                additionalProperties: false
                required: [thingId]
                properties:
                  thingId: { type: string }
  /things/{thingId}:
    patch:
      operationId: updateThing
      parameters:
        - name: thingId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              additionalProperties: false
              required: [expectedVersion]
              properties:
                expectedVersion: { type: integer }
                label: { type: string }
                note: { type: [string, 'null'] }
                colour:
                  oneOf:
                    - type: 'null'
                    - \$ref: '#/components/Colour'
      responses:
        '200':
          description: The thing.
          content:
            application/json:
              schema:
                type: object
                additionalProperties: false
                required: [thingId]
                properties:
                  thingId: { type: string }
''';

/// The source of one generated class, so an assertion lands on the class that
/// declares the field rather than anywhere the name appears.
String classBody(String source, String className) {
  final start = source.indexOf('final class $className {');
  expect(start, isNot(-1), reason: '$className is not in the generated source');
  return source.substring(start, source.indexOf('\n}', start));
}

/// The source of one generated operation.
String operationBody(String source, String operationId) {
  final start = source.indexOf(' $operationId({');
  expect(start, isNot(-1), reason: '$operationId is not in the generated client');
  // The method ends at a closing brace on its own line; the parameter list
  // ends at `}) async {`, which is why that is not what is searched for.
  return source.substring(start, source.indexOf('\n  }\n', start));
}

/// The doc comment immediately above one generated operation.
String operationDocumentation(String source, String operationId) {
  final method = source.indexOf(' $operationId({');
  expect(method, isNot(-1), reason: '$operationId is not in the generated client');
  // The doc block runs from the blank line before the method to the method.
  final blank = source.lastIndexOf('\n\n', method);
  return source.substring(blank, method);
}

void main() {
  late Directory directory;
  late String models;
  late String client;

  setUpAll(() {
    directory = Directory.systemTemp.createTempSync('karar_synthetic_contract');
    File('${directory.path}/openapi.yaml').writeAsStringSync(syntheticContract);
    final contract =
        generator.ContractReader('${directory.path}/openapi.yaml').read();
    final emitter = generator.DartEmitter(contract);
    models = emitter.emitModels();
    client = emitter.emitClient();
  });

  tearDownAll(() {
    if (directory.existsSync()) {
      directory.deleteSync(recursive: true);
    }
  });

  group('a named scalar component is an alias', () {
    test('no class is emitted for it', () {
      expect(models, isNot(contains('class GradeDto')));
    });

    test('the field carries the underlying type', () {
      expect(
        classBody(models, 'ListThingsResponseDto'),
        contains('final String grade;'),
      );
    });

    test('and is decoded as that type, not cast to a map', () {
      expect(
        classBody(models, 'ListThingsResponseDto'),
        contains("json['grade']! as String"),
      );
    });
  });

  group('absent, present and explicitly null are three different requests', () {
    test('an optional NULLABLE request field is three-state', () {
      final body = classBody(models, 'UpdateThingRequestDto');
      expect(body, contains('final Omittable<String> note;'));
      expect(
        body,
        contains('this.note = const Omittable<String>.omitted()'),
        reason: 'a caller that says nothing about a field must send nothing',
      );
      expect(body, contains("if (note.isSent) 'note': note.valueOrNull,"));
    });

    test('a nullable enumeration field is three-state too', () {
      final body = classBody(models, 'UpdateThingRequestDto');
      expect(body, contains('final Omittable<ColourDto> colour;'));
      expect(
        body,
        contains("if (colour.isSent) 'colour': colour.valueOrNull?.toWire(),"),
      );
    });

    test('an optional NON-nullable request field is omitted when it is null', () {
      // The contract does not admit `null` for it, so there is nothing to
      // clear and nothing to distinguish: absent is the only way to say
      // nothing.
      final body = classBody(models, 'UpdateThingRequestDto');
      expect(body, contains('final String? label;'));
      expect(body, contains("if (label != null) 'label': label,"));
    });

    test('a required field is always written', () {
      expect(
        classBody(models, 'UpdateThingRequestDto'),
        contains("'expectedVersion': expectedVersion,"),
      );
    });

    test('a RESPONSE field stays a plain nullable one', () {
      // A reader that received no field and a reader that received `null` have
      // the same information, so the wrapper would be ceremony with no
      // meaning behind it.
      final body = classBody(models, 'ListThingsResponseDto');
      expect(body, contains('final String? note;'));
      expect(body, isNot(contains('Omittable')));
    });

    test('the wrapper round-trips the difference when decoding', () {
      final body = classBody(models, 'UpdateThingRequestDto');
      expect(body, contains("json.containsKey('note')"));
      expect(body, contains('const Omittable<String>.omitted()'));
    });
  });

  group('a query parameter travels as the contract spells it', () {
    test('an enumeration goes as its wire value', () {
      expect(operationBody(client, 'listThings'), contains("'colour': colour?.toWire()"));
    });

    test('an instant goes as ISO-8601 in UTC', () {
      expect(
        operationBody(client, 'listThings'),
        contains("'since': since?.toUtc().toIso8601String()"),
      );
    });
  });

  group('a request body the generator cannot send is stated, not hidden', () {
    // `ApiTransport` carries a JSON-encodable body and nothing else, so a
    // `text/csv` body cannot be sent at all. What must never happen is the
    // generator emitting an operation that LOOKS complete and issues a request
    // with no body: an upload that silently sends nothing is worse than one
    // that was never offered.
    test('the operation carries no body parameter', () {
      final body = operationBody(client, 'uploadThingSource');
      expect(body, isNot(contains('body:')));
    });

    test('and the generated documentation says so', () {
      expect(operationDocumentation(client, 'uploadThingSource'),
          allOf(<Matcher>[
            contains('NOT MODELLED'),
            contains('text/csv'),
            contains('sends NO BODY'),
          ]));
    });

    test('an operation with a JSON body carries no such note', () {
      expect(
        operationDocumentation(client, 'updateThing'),
        isNot(contains('NOT MODELLED')),
      );
    });
  });

  group('the enumeration fallback is a member of its own', () {
    test('it carries no wire value and is never sent', () {
      expect(models, contains("unknown('');"));
      expect(models, contains('String? toWire() => this == unknown ? null : wireValue;'));
    });

    test('and a contract that declares UNKNOWN keeps both members apart', () {
      // The synthetic contract has no UNKNOWN, so this is asserted against the
      // real one, where `AccountNature` declares it. Collapsing the two would
      // let a value the platform never sent render as one it did.
      final committed =
          File('lib/core/networking/generated/models.dart').readAsStringSync();
      final nature = committed.substring(
        committed.indexOf('enum AccountNatureDto {'),
        committed.indexOf('\n}', committed.indexOf('enum AccountNatureDto {')),
      );
      expect(nature, contains("unknown('UNKNOWN')"));
      expect(nature, contains("unrecognised('')"));
    });
  });
}
