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
  /things/{thingId}/ambiguous-source:
    post:
      operationId: uploadThingAmbiguousSource
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
          application/vnd.ms-excel:
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

/// The parameter list of one generated operation, and nothing else.
///
/// Separate from [operationBody] so an assertion about what a caller must
/// PASS cannot be satisfied by text from the method's body.
String operationSignature(String source, String operationId) {
  final start = source.indexOf(' $operationId({');
  expect(start, isNot(-1), reason: '$operationId is not in the generated client');
  return source.substring(start, source.indexOf('}) async {', start));
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

  group('a body the contract declares as bytes is sent as bytes', () {
    // `ApiTransport` once carried a JSON-encodable body and nothing else, so
    // a `text/csv` body could not be sent at all and the generator stated the
    // gap rather than emitting an upload that silently sent nothing. The
    // transport now carries raw bytes under a declared media type, so the
    // generator carries them — but only when the contract leaves it no
    // choice about which type to send.
    test('the operation takes the bytes', () {
      expect(operationSignature(client, 'uploadThingSource'),
          contains('required Uint8List body'));
    });

    test('and sends them under the media type the contract names', () {
      expect(
        operationBody(client, 'uploadThingSource'),
        contains("rawBody: RawRequestBody(bytes: body, mediaType: 'text/csv')"),
      );
    });

    test('never as a JSON body', () {
      // The distinction the whole change exists for: a raw body must not
      // travel through the JSON field, which the transport sends as
      // application/json regardless of what the contract declares.
      expect(operationBody(client, 'uploadThingSource'), isNot(contains('body: body')));
      expect(operationBody(client, 'uploadThingSource'), isNot(contains('body.toJson()')));
    });

    test('and the note about an unsendable body is gone', () {
      expect(
        operationDocumentation(client, 'uploadThingSource'),
        isNot(contains('NOT MODELLED')),
      );
    });

    test('two declared media types is a CHOICE, and the generator refuses it', () {
      // One declared type is a statement the contract makes. Two is a
      // decision, and a generator that picks one has invented a fact about
      // the wire — the same reason it refuses to choose between two 2xx
      // schemas or invent a response type.
      final body = operationBody(client, 'uploadThingAmbiguousSource');
      expect(body, isNot(contains('rawBody')));
      expect(
        operationSignature(client, 'uploadThingAmbiguousSource'),
        isNot(contains('Uint8List')),
      );
      expect(
        operationDocumentation(client, 'uploadThingAmbiguousSource'),
        allOf(<Matcher>[
          contains('NOT MODELLED'),
          contains('text/csv'),
          contains('application/vnd.ms-excel'),
          contains('sends NO BODY'),
        ]),
      );
    });

    test('an operation with a JSON body carries neither', () {
      expect(
        operationDocumentation(client, 'updateThing'),
        isNot(contains('NOT MODELLED')),
      );
      expect(operationBody(client, 'updateThing'), isNot(contains('rawBody')));
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
