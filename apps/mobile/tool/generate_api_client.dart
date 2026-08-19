// Generates the internal Dart API client from the hand-authored OpenAPI
// contract in packages/api-contracts/openapi.
//
//   Generate:    dart run tool/generate_api_client.dart
//   Drift check: dart run tool/generate_api_client.dart --check
//
// Both commands run from apps/mobile. `--check` regenerates in memory and
// exits non-zero if any output file differs from what is on disk, so CI can
// prove the committed client matches the contract without a git working tree.
//
// WHY A FIRST-PARTY GENERATOR RATHER THAN openapi-generator
// ---------------------------------------------------------
// The contract is authored by hand (ADR-0009) and is deliberately
// schema-light: many identity responses are documented in prose with no
// schema, path items live in per-module fragment files, and each fragment
// carries its own `components:` block whose members sit directly under
// `components` rather than under `components/schemas`. A conforming generator
// either rejects that document or silently drops the operations it cannot
// model. This generator reads exactly the dialect the contract is written in,
// fails loudly on anything it does not understand, and emits nothing it cannot
// justify: an operation whose response has no schema returns the decoded JSON
// object rather than a fabricated type.
//
// Reproducibility: output depends only on the contract files and on
// [generatorVersion]. Ordering is sorted everywhere, so two runs on the same
// input produce byte-identical files.
//
// The generated files are committed and MUST NOT be hand-edited. Change the
// contract, or change this generator.
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:yaml/yaml.dart';

/// Bumped whenever the emitted shape changes. Recorded in every output file so
/// a stale checkout is visible in a diff.
const String generatorVersion = '1.0.0';

/// Component schemas the client does not model as DTOs.
///
/// RFC 7807 problem documents are decoded by the hand-written
/// `core/networking/problem_details.dart` and mapped to typed failures; a
/// generated DTO for them would be a second, competing definition.
const Set<String> skippedComponents = <String>{'Problem', 'ProblemResponse'};

const String _outputDirectoryDefault = 'lib/core/networking/generated';

Future<void> main(List<String> arguments) async {
  final checkOnly = arguments.contains('--check');

  final specPath = _resolveSpecPath();
  final outputDirectory = Directory(p.normalize(p.absolute(_outputDirectoryDefault)));

  final Contract contract;
  try {
    contract = ContractReader(specPath).read();
  } on ContractError catch (error) {
    stderr.writeln('Contract error: ${error.message}');
    exitCode = 2;
    return;
  }

  final emitter = DartEmitter(contract);
  final files = <String, String>{
    'models.dart': emitter.emitModels(),
    'karar_api_client.dart': emitter.emitClient(),
  };

  if (checkOnly) {
    final differences = <String>[];
    for (final entry in files.entries) {
      final file = File(p.join(outputDirectory.path, entry.key));
      if (!file.existsSync()) {
        differences.add('${entry.key} is missing');
        continue;
      }
      if (file.readAsStringSync() != entry.value) {
        differences.add('${entry.key} differs from the contract');
      }
    }
    if (differences.isEmpty) {
      stdout.writeln('API client is in sync with the contract '
          '(${contract.operations.length} operations, ${contract.schemas.length} schemas).');
      return;
    }
    stderr
      ..writeln('Generated API client has drifted from the contract:')
      ..writeAll(differences.map((String line) => '  - $line\n'))
      ..writeln('Run: dart run tool/generate_api_client.dart');
    exitCode = 1;
    return;
  }

  outputDirectory.createSync(recursive: true);
  for (final entry in files.entries) {
    File(p.join(outputDirectory.path, entry.key)).writeAsStringSync(entry.value);
  }
  stdout.writeln('Generated ${files.length} files in '
      '${p.relative(outputDirectory.path)} '
      '(${contract.operations.length} operations, ${contract.schemas.length} schemas).');
}

String _resolveSpecPath() {
  var directory = Directory.current;
  for (var depth = 0; depth < 8; depth++) {
    final candidate =
        File(p.join(directory.path, 'packages', 'api-contracts', 'openapi', 'openapi.yaml'));
    if (candidate.existsSync()) {
      return candidate.path;
    }
    final parent = directory.parent;
    if (parent.path == directory.path) {
      break;
    }
    directory = parent;
  }
  throw ContractError('packages/api-contracts/openapi/openapi.yaml was not found '
      'above ${Directory.current.path}.');
}

/// A problem in the contract that the generator refuses to guess around.
final class ContractError implements Exception {
  ContractError(this.message);

  final String message;

  @override
  String toString() => 'ContractError: $message';
}

// ---------------------------------------------------------------------------
// Intermediate representation
// ---------------------------------------------------------------------------

/// The whole contract, resolved.
final class Contract {
  Contract({
    required this.title,
    required this.version,
    required this.sourceDigest,
    required this.operations,
    required this.schemas,
  });

  final String title;
  final String version;

  /// SHA-256-shaped digest of every contract file that fed this run.
  final String sourceDigest;

  /// Sorted by operation id.
  final List<Operation> operations;

  /// Sorted by name.
  final List<SchemaDefinition> schemas;
}

/// One HTTP operation.
final class Operation {
  Operation({
    required this.id,
    required this.method,
    required this.path,
    required this.summary,
    required this.description,
    required this.requiresAuthentication,
    required this.pathParameters,
    required this.queryParameters,
    required this.requestType,
    required this.requestRequired,
    required this.successStatus,
    required this.responseType,
  });

  final String id;
  final String method;
  final String path;
  final String summary;
  final String description;
  final bool requiresAuthentication;
  final List<Parameter> pathParameters;
  final List<Parameter> queryParameters;

  /// Null when the operation sends no body.
  final DartType? requestType;
  final bool requestRequired;
  final int successStatus;

  /// Null when the contract documents no schema for the success response.
  final DartType? responseType;

  bool get isIdempotent => method == 'get' || method == 'head' || method == 'put' || method == 'delete';
}

/// A path or query parameter.
final class Parameter {
  Parameter({required this.name, required this.dartName, required this.type, required this.required});

  final String name;
  final String dartName;
  final DartType type;
  final bool required;
}

/// A generated type reference.
final class DartType {
  const DartType(this.name, {this.nullable = false, this.isDto = false, this.isEnum = false, this.itemType});

  final String name;
  final bool nullable;
  final bool isDto;
  final bool isEnum;
  final DartType? itemType;

  bool get isList => itemType != null;

  String get declaration => nullable ? '$name?' : name;

  DartType asNullable() =>
      DartType(name, nullable: true, isDto: isDto, isEnum: isEnum, itemType: itemType);
}

/// A generated declaration.
sealed class SchemaDefinition {
  SchemaDefinition(this.name, this.documentation);

  final String name;
  final String documentation;
}

/// A plain object DTO.
final class ObjectSchema extends SchemaDefinition {
  ObjectSchema(super.name, super.documentation, this.properties);

  final List<PropertyDefinition> properties;
}

/// A discriminated union.
final class UnionSchema extends SchemaDefinition {
  UnionSchema(super.name, super.documentation, this.discriminator, this.variants);

  final String discriminator;
  final List<UnionVariant> variants;
}

/// One branch of a union.
final class UnionVariant {
  UnionVariant({required this.className, required this.discriminatorValue, required this.properties});

  final String className;
  final String discriminatorValue;
  final List<PropertyDefinition> properties;
}

/// A string enum.
final class EnumSchema extends SchemaDefinition {
  EnumSchema(super.name, super.documentation, this.values);

  /// Wire value to Dart member name, sorted by wire value.
  final Map<String, String> values;
}

/// One field of an object.
final class PropertyDefinition {
  PropertyDefinition({
    required this.wireName,
    required this.dartName,
    required this.type,
    required this.required,
    required this.documentation,
    required this.isDateTime,
  });

  final String wireName;
  final String dartName;
  final DartType type;
  final bool required;
  final String documentation;
  final bool isDateTime;
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/// Reads the contract dialect described at the top of this file.
final class ContractReader {
  ContractReader(this.specPath);

  final String specPath;

  final Map<String, YamlMap> _fragments = <String, YamlMap>{};
  final List<String> _sourceContents = <String>[];
  final Map<String, SchemaDefinition> _schemas = <String, SchemaDefinition>{};
  final Map<String, String> _componentClassNames = <String, String>{};

  Contract read() {
    final rootText = File(specPath).readAsStringSync();
    _sourceContents.add(rootText);
    final root = _asMap(loadYaml(rootText), 'openapi.yaml');

    final info = _asMap(root['info'], 'info');
    final paths = _asMap(root['paths'], 'paths');

    final operations = <Operation>[];
    for (final entry in paths.entries) {
      final path = entry.key.toString();
      final pathItem = _resolvePathItem(entry.value, path);
      for (final methodEntry in pathItem.entries) {
        final method = methodEntry.key.toString().toLowerCase();
        if (!const <String>{'get', 'post', 'put', 'patch', 'delete', 'head'}.contains(method)) {
          continue;
        }
        operations.add(
          _readOperation(
            path: path,
            method: method,
            operation: _asMap(methodEntry.value, '$method $path'),
            fragmentKey: _fragmentKeyFor(entry.value),
          ),
        );
      }
    }

    operations.sort((Operation a, Operation b) => a.id.compareTo(b.id));
    final schemas = _schemas.values.toList()
      ..sort((SchemaDefinition a, SchemaDefinition b) => a.name.compareTo(b.name));

    return Contract(
      title: info['title']?.toString() ?? 'API',
      version: info['version']?.toString() ?? '0.0.0',
      sourceDigest: _digest(),
      operations: operations,
      schemas: schemas,
    );
  }

  String _digest() {
    // A stable, order-independent digest of every contract file read. Uses
    // only dart:core so the generator has no crypto dependency; the value
    // exists to make a stale regeneration visible in a diff, not to defend
    // against tampering.
    final combined = (_sourceContents.toList()..sort()).join('\n');
    var hash = 0x811c9dc5;
    for (final unit in utf8.encode(combined)) {
      hash ^= unit;
      hash = (hash * 0x01000193) & 0xffffffff;
    }
    return hash.toRadixString(16).padLeft(8, '0');
  }

  String _fragmentKeyFor(Object? refHolder) {
    if (refHolder is YamlMap && refHolder['\$ref'] is String) {
      final ref = refHolder['\$ref']! as String;
      return ref.split('#').first;
    }
    return 'openapi.yaml';
  }

  /// Resolves a `$ref` in a parameter position, in whichever fragment declares it.
  ///
  /// Parameters may be shared the same way schemas and path items already are.
  /// The reader assumed they were always inline and dereferenced `name` with
  /// `!`, so the first shared parameter crashed the generator with a null-check
  /// error naming no file — a failure that says nothing about the contract that
  /// caused it. Resolution here is the same pointer walk the schema and
  /// path-item readers use, so a parameter behaves like every other reference.
  YamlMap _resolveParameter(Object? raw, String owner, String fragmentKey) {
    final parameter = _asMap(raw, 'parameter of $owner');
    final ref = parameter[r'$ref'];
    if (ref is! String) {
      return parameter;
    }
    final parts = ref.split('#');
    if (parts.length != 2) {
      throw ContractError('Parameter of $owner has an unsupported \$ref: $ref');
    }
    final fragment = parts[0].isEmpty ? _loadFragment(fragmentKey) : _loadFragment(parts[0]);
    return _asMap(_resolvePointer(fragment, parts[1], ref), 'parameter $ref');
  }

  YamlMap _resolvePathItem(Object? value, String path) {
    if (value is! YamlMap) {
      throw ContractError('Path $path is not a mapping.');
    }
    final ref = value['\$ref'];
    if (ref is! String) {
      return value;
    }
    final parts = ref.split('#');
    if (parts.length != 2) {
      throw ContractError('Path $path has an unsupported \$ref: $ref');
    }
    final fragment = _loadFragment(parts[0]);
    return _asMap(_resolvePointer(fragment, parts[1], ref), 'path item $ref');
  }

  YamlMap _loadFragment(String relativePath) {
    final cached = _fragments[relativePath];
    if (cached != null) {
      return cached;
    }
    final file = File(p.normalize(p.join(p.dirname(specPath), relativePath)));
    if (!file.existsSync()) {
      throw ContractError('Fragment $relativePath does not exist.');
    }
    final text = file.readAsStringSync();
    _sourceContents.add(text);
    final loaded = _asMap(loadYaml(text), relativePath);
    _fragments[relativePath] = loaded;
    return loaded;
  }

  Object? _resolvePointer(YamlMap document, String pointer, String reference) {
    if (pointer.isEmpty || pointer == '/') {
      return document;
    }
    Object? current = document;
    for (final rawSegment in pointer.split('/').skip(1)) {
      final segment = rawSegment.replaceAll('~1', '/').replaceAll('~0', '~');
      if (current is! YamlMap || !current.containsKey(segment)) {
        throw ContractError('Reference $reference does not resolve at "$segment".');
      }
      current = current[segment];
    }
    return current;
  }

  Operation _readOperation({
    required String path,
    required String method,
    required YamlMap operation,
    required String fragmentKey,
  }) {
    final id = operation['operationId']?.toString();
    if (id == null) {
      throw ContractError('$method $path has no operationId.');
    }

    final pathParameters = <Parameter>[];
    final queryParameters = <Parameter>[];
    final parameters = operation['parameters'];
    if (parameters is YamlList) {
      for (final raw in parameters) {
        final parameter = _resolveParameter(raw, id, fragmentKey);
        final rawName = parameter['name'];
        final rawLocation = parameter['in'];
        if (rawName == null || rawLocation == null) {
          throw ContractError(
            'A parameter of $id declares no name or no location. A \$ref that '
            'does not resolve to a parameter object reaches here as an empty '
            'map, so the reference is the thing to check.',
          );
        }
        final name = rawName.toString();
        final location = rawLocation.toString();
        final schema = parameter['schema'];
        final type = schema is YamlMap
            ? _typeOf(schema, owner: _pascal(id), property: name, fragmentKey: fragmentKey)
            : const DartType('String');
        final required = parameter['required'] == true;
        final resolved = Parameter(
          name: name,
          dartName: _camel(name),
          type: required ? type : type.asNullable(),
          required: required,
        );
        if (location == 'path') {
          pathParameters.add(resolved);
        } else if (location == 'query') {
          queryParameters.add(resolved);
        } else {
          throw ContractError('Parameter location "$location" on $id is not supported.');
        }
      }
    }

    DartType? requestType;
    var requestRequired = false;
    final requestBody = operation['requestBody'];
    if (requestBody is YamlMap) {
      requestRequired = requestBody['required'] == true;
      final schema = _jsonSchemaOf(requestBody['content'], '$id request body');
      if (schema != null) {
        requestType = _typeOf(
          schema,
          owner: '${_pascal(id)}RequestDto',
          property: null,
          fragmentKey: fragmentKey,
          preferOwnerName: true,
        );
      }
    }

    final responses = _asMap(operation['responses'], 'responses of $id');
    final successStatuses = responses.keys
        .map((Object? key) => int.tryParse(key.toString()))
        .whereType<int>()
        .where((int status) => status >= 200 && status < 300)
        .toList()
      ..sort();
    if (successStatuses.isEmpty) {
      throw ContractError('$id declares no 2xx response.');
    }

    DartType? responseType;
    var chosenStatus = successStatuses.first;
    final described = <int, YamlMap>{};
    for (final status in successStatuses) {
      final response = responses['$status'];
      if (response is! YamlMap) {
        continue;
      }
      final schema = _jsonSchemaOf(response['content'], '$id $status response');
      if (schema != null) {
        described[status] = schema;
      }
    }
    if (described.length > 1) {
      throw ContractError(
        '$id declares schemas on more than one 2xx response '
        '(${described.keys.join(', ')}); the generator refuses to guess which is canonical.',
      );
    }
    if (described.length == 1) {
      chosenStatus = described.keys.first;
      responseType = _typeOf(
        described.values.first,
        owner: '${_pascal(id)}ResponseDto',
        property: null,
        fragmentKey: fragmentKey,
        preferOwnerName: true,
      );
    }

    return Operation(
      id: id,
      method: method,
      path: path,
      summary: operation['summary']?.toString() ?? '',
      description: operation['description']?.toString() ?? '',
      requiresAuthentication: operation['security'] is YamlList &&
          (operation['security']! as YamlList).isNotEmpty,
      pathParameters: pathParameters,
      queryParameters: queryParameters,
      requestType: requestType,
      requestRequired: requestRequired,
      successStatus: chosenStatus,
      responseType: responseType,
    );
  }

  YamlMap? _jsonSchemaOf(Object? content, String context) {
    if (content is! YamlMap) {
      return null;
    }
    for (final mediaType in const <String>['application/json']) {
      final media = content[mediaType];
      if (media is YamlMap && media['schema'] is YamlMap) {
        return media['schema']! as YamlMap;
      }
    }
    return null;
  }

  /// Resolves a schema node into a Dart type, registering any declaration it
  /// implies.
  DartType _typeOf(
    YamlMap schema, {
    required String owner,
    required String? property,
    required String fragmentKey,
    bool preferOwnerName = false,
  }) {
    final ref = schema['\$ref'];
    if (ref is String) {
      return _typeOfReference(ref, fragmentKey: fragmentKey);
    }

    final oneOf = schema['oneOf'];
    if (oneOf is YamlList) {
      return _typeOfOneOf(
        oneOf,
        schema,
        owner: owner,
        property: property,
        fragmentKey: fragmentKey,
        preferOwnerName: preferOwnerName,
      );
    }

    final declared = schema['type'];
    final types = _typeNames(declared);
    final nullable = types.contains('null');
    final concrete = types.where((String name) => name != 'null').toList();
    if (concrete.length != 1) {
      throw ContractError('Schema for ${property ?? owner} declares types $types, '
          'which the generator does not model.');
    }

    switch (concrete.single) {
      case 'object':
        final className = preferOwnerName ? owner : _compose(owner, property);
        _registerObject(className, schema, fragmentKey: fragmentKey);
        final type = DartType(className, isDto: true);
        return nullable ? type.asNullable() : type;
      case 'array':
        final items = schema['items'];
        if (items is! YamlMap) {
          throw ContractError('Array ${property ?? owner} has no items schema.');
        }
        final itemType = _typeOf(
          items,
          owner: preferOwnerName ? owner : _compose(owner, property),
          property: 'Item',
          fragmentKey: fragmentKey,
          preferOwnerName: !preferOwnerName && property == null,
        );
        final type = DartType('List<${itemType.declaration}>', itemType: itemType);
        return nullable ? type.asNullable() : type;
      case 'string':
        final enumValues = schema['enum'];
        if (enumValues is YamlList) {
          final className = _compose(owner, property);
          final hasNull = enumValues.any((Object? value) => value == null);
          _registerEnum(className, enumValues, schema['description']?.toString() ?? '');
          final type = DartType(className, isEnum: true);
          return nullable || hasNull ? type.asNullable() : type;
        }
        final format = schema['format']?.toString();
        final type = format == 'date-time' ? const DartType('DateTime') : const DartType('String');
        return nullable ? type.asNullable() : type;
      case 'integer':
        return nullable ? const DartType('int').asNullable() : const DartType('int');
      case 'number':
        return nullable ? const DartType('double').asNullable() : const DartType('double');
      case 'boolean':
        return nullable ? const DartType('bool').asNullable() : const DartType('bool');
      default:
        throw ContractError('Type "${concrete.single}" is not supported '
            '(${property ?? owner}).');
    }
  }

  DartType _typeOfReference(String ref, {required String fragmentKey}) {
    final parts = ref.split('#');
    final fragmentPath = parts[0].isEmpty ? fragmentKey : parts[0];
    final pointer = parts.length > 1 ? parts[1] : '';
    final segments = pointer.split('/').where((String s) => s.isNotEmpty).toList();
    if (segments.length < 2 || segments.first != 'components') {
      throw ContractError('Reference $ref is not a components reference.');
    }
    final componentName = segments.last;
    if (skippedComponents.contains(componentName)) {
      throw ContractError('Reference $ref points at $componentName, which is '
          'handled by the hand-written problem-details layer and must not '
          'appear in a success schema.');
    }
    final document = fragmentPath == 'openapi.yaml'
        ? _asMap(loadYaml(File(specPath).readAsStringSync()), 'openapi.yaml')
        : _loadFragment(fragmentPath);
    final resolved = _asMap(_resolvePointer(document, pointer, ref), 'component $ref');
    final className = '${_pascal(componentName)}Dto';
    final previousOwner = _componentClassNames[className];
    if (previousOwner != null && previousOwner != '$fragmentPath#$componentName') {
      throw ContractError('Component name $componentName is defined in two '
          'fragments ($previousOwner and $fragmentPath); rename one.');
    }
    _componentClassNames[className] = '$fragmentPath#$componentName';

    if (!_schemas.containsKey(className)) {
      // Reserve the name before recursing so a self-referential schema
      // terminates.
      _schemas[className] = ObjectSchema(className, '', const <PropertyDefinition>[]);
      final oneOf = resolved['oneOf'];
      if (oneOf is YamlList) {
        _schemas[className] = _buildUnion(
          className,
          oneOf,
          resolved,
          fragmentKey: fragmentPath,
        );
      } else {
        _registerObject(className, resolved, fragmentKey: fragmentPath, force: true);
      }
    }
    final schema = _schemas[className]!;
    return DartType(className, isDto: schema is! EnumSchema, isEnum: schema is EnumSchema);
  }

  DartType _typeOfOneOf(
    YamlList branches,
    YamlMap schema, {
    required String owner,
    required String? property,
    required String fragmentKey,
    required bool preferOwnerName,
  }) {
    final nonNull = branches
        .whereType<YamlMap>()
        .where((YamlMap branch) => _typeNames(branch['type']).join() != 'null')
        .toList();
    final hasNull = branches.length != nonNull.length;

    if (nonNull.length == 1) {
      final type = _typeOf(
        nonNull.single,
        owner: owner,
        property: property,
        fragmentKey: fragmentKey,
        preferOwnerName: preferOwnerName,
      );
      return hasNull ? type.asNullable() : type;
    }

    final className = preferOwnerName ? owner : _compose(owner, property);
    if (!_schemas.containsKey(className)) {
      _schemas[className] = ObjectSchema(className, '', const <PropertyDefinition>[]);
      _schemas[className] = _buildUnion(
        className,
        YamlList.wrap(nonNull),
        schema,
        fragmentKey: fragmentKey,
      );
    }
    final type = DartType(className, isDto: true);
    return hasNull ? type.asNullable() : type;
  }

  UnionSchema _buildUnion(
    String className,
    YamlList branches,
    YamlMap schema, {
    required String fragmentKey,
  }) {
    final discriminator = schema['discriminator'];
    if (discriminator is! YamlMap || discriminator['propertyName'] is! String) {
      throw ContractError('Union $className has no discriminator; the generator '
          'refuses to guess which branch a payload is.');
    }
    final propertyName = discriminator['propertyName']! as String;

    final variants = <UnionVariant>[];
    for (final raw in branches) {
      final branch = _asMap(raw, 'branch of $className');
      final resolved = branch['\$ref'] is String
          ? _resolveInlineReference(branch['\$ref']! as String, fragmentKey)
          : branch;
      final value = _discriminatorValue(resolved, propertyName, className);
      final base = className.endsWith('Dto')
          ? className.substring(0, className.length - 3)
          : className;
      final variantName = '$base${_pascal(value.toLowerCase())}Dto';
      final branchRef = branch['\$ref'];
      final properties = _propertiesOf(
        resolved,
        owner: variantName,
        fragmentKey: branchRef is String && branchRef.split('#').first.isNotEmpty
            ? branchRef.split('#').first
            : fragmentKey,
        // The discriminator is a constant per branch and is exposed as an
        // override on the variant. Modelling it as a field would generate a
        // single-value enum per branch that nothing reads.
        excludeProperty: propertyName,
      );
      variants.add(
        UnionVariant(
          className: variantName,
          discriminatorValue: value,
          properties: properties,
        ),
      );
    }
    variants.sort((UnionVariant a, UnionVariant b) => a.discriminatorValue.compareTo(b.discriminatorValue));
    return UnionSchema(className, schema['description']?.toString() ?? '', propertyName, variants);
  }

  YamlMap _resolveInlineReference(String ref, String fragmentKey) {
    final parts = ref.split('#');
    final fragmentPath = parts[0].isEmpty ? fragmentKey : parts[0];
    final document = fragmentPath == 'openapi.yaml'
        ? _asMap(loadYaml(File(specPath).readAsStringSync()), 'openapi.yaml')
        : _loadFragment(fragmentPath);
    return _asMap(_resolvePointer(document, parts.length > 1 ? parts[1] : '', ref), 'reference $ref');
  }

  String _discriminatorValue(YamlMap branch, String propertyName, String className) {
    final properties = branch['properties'];
    if (properties is! YamlMap || properties[propertyName] is! YamlMap) {
      throw ContractError('Branch of $className has no "$propertyName" property.');
    }
    final property = properties[propertyName]! as YamlMap;
    final values = property['enum'];
    if (values is! YamlList || values.length != 1) {
      throw ContractError('Branch of $className must pin "$propertyName" to exactly one value.');
    }
    return values.first.toString();
  }

  void _registerObject(
    String className,
    YamlMap schema, {
    required String fragmentKey,
    bool force = false,
  }) {
    final existing = _schemas[className];
    if (existing != null && !force && existing is ObjectSchema && existing.properties.isNotEmpty) {
      return;
    }
    _schemas[className] = ObjectSchema(className, '', const <PropertyDefinition>[]);
    final properties = _propertiesOf(schema, owner: className, fragmentKey: fragmentKey);
    _schemas[className] =
        ObjectSchema(className, schema['description']?.toString() ?? '', properties);
  }

  List<PropertyDefinition> _propertiesOf(
    YamlMap schema, {
    required String owner,
    required String fragmentKey,
    String? excludeProperty,
  }) {
    final properties = schema['properties'];
    if (properties is! YamlMap) {
      return const <PropertyDefinition>[];
    }
    final requiredNames = <String>{
      if (schema['required'] is YamlList)
        for (final name in schema['required']! as YamlList) name.toString(),
    };
    final result = <PropertyDefinition>[];
    for (final entry in properties.entries) {
      final wireName = entry.key.toString();
      if (wireName == excludeProperty) {
        continue;
      }
      final propertySchema = _asMap(entry.value, '$owner.$wireName');
      var type = _typeOf(
        propertySchema,
        owner: owner.endsWith('Dto') ? owner.substring(0, owner.length - 3) : owner,
        property: wireName,
        fragmentKey: fragmentKey,
      );
      final isRequired = requiredNames.contains(wireName);
      if (!isRequired) {
        type = type.asNullable();
      }
      result.add(
        PropertyDefinition(
          wireName: wireName,
          dartName: _camel(wireName),
          type: type,
          required: isRequired,
          documentation: propertySchema['description']?.toString() ?? '',
          isDateTime: type.name == 'DateTime',
        ),
      );
    }
    result.sort((PropertyDefinition a, PropertyDefinition b) => a.wireName.compareTo(b.wireName));
    return result;
  }

  void _registerEnum(String className, YamlList values, String documentation) {
    if (_schemas.containsKey(className)) {
      return;
    }
    final members = <String, String>{};
    for (final raw in values) {
      if (raw == null) {
        continue;
      }
      final wire = raw.toString();
      final member = _camel(wire.toLowerCase());
      if (member == 'unknown') {
        throw ContractError('Enum $className declares a value that collides with '
            'the generated "unknown" member.');
      }
      // A wire value made only of separators, or one starting with a digit,
      // cannot become a Dart identifier. Fail here with the offending value
      // rather than emitting source that will not parse.
      if (member.isEmpty ||
          RegExp(r'^[0-9]').hasMatch(member) ||
          _dartReservedWords.contains(member)) {
        throw ContractError('Enum $className declares the value "$wire", which '
            'cannot be expressed as a Dart identifier. Rename it in the '
            'contract.');
      }
      // Distinct wire values must stay distinct in Dart. Because every
      // non-alphanumeric character separates, "a/b" and "a-b" both reduce to
      // `aB` — two members with one name is uncompilable, so it is caught here
      // where the cause is still visible.
      final Object? collidingWire = members.entries
          .where((MapEntry<String, String> entry) => entry.value == member)
          .map((MapEntry<String, String> entry) => entry.key)
          .firstOrNull;
      if (collidingWire != null) {
        throw ContractError('Enum $className declares "$wire" and '
            '"$collidingWire", which both become the Dart member `$member`. '
            'Rename one in the contract.');
      }
      members[wire] = member;
    }
    final sorted = <String, String>{
      for (final key in members.keys.toList()..sort()) key: members[key]!,
    };
    _schemas[className] = EnumSchema(className, documentation, sorted);
  }

  List<String> _typeNames(Object? declared) {
    if (declared == null) {
      return const <String>['object'];
    }
    if (declared is YamlList) {
      return declared.map((Object? value) => value.toString()).toList();
    }
    return <String>[declared.toString()];
  }

  YamlMap _asMap(Object? value, String context) {
    if (value is YamlMap) {
      return value;
    }
    throw ContractError('$context is not a mapping.');
  }

  String _compose(String owner, String? property) {
    final base = owner.endsWith('Dto') ? owner.substring(0, owner.length - 3) : owner;
    if (property == null) {
      return '${base}Dto';
    }
    return '$base${_pascal(property)}Dto';
  }
}

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

/// Renders the intermediate representation as Dart source.
final class DartEmitter {
  DartEmitter(this.contract);

  final Contract contract;

  String _header(String purpose) => '''
// GENERATED CODE — DO NOT MODIFY BY HAND.
//
// $purpose
//
// Source:     packages/api-contracts/openapi/openapi.yaml
// Contract:   ${contract.title} ${contract.version}
// Digest:     ${contract.sourceDigest}
// Generator:  tool/generate_api_client.dart $generatorVersion
//
// Regenerate:  dart run tool/generate_api_client.dart
// Drift check: dart run tool/generate_api_client.dart --check
''';

  String emitModels() {
    final buffer = StringBuffer()
      ..writeln(_header('Data-transfer objects for the Karar API.'))
      ..writeln('''
// These DTOs belong to the DATA layer. A feature's domain layer must never
// import this file: map a DTO to a domain entity in the repository
// implementation and return the entity.
//
// `toString` prints the type name only. A DTO routinely carries an e-mail
// address, a display name or an identifier, and none of that may reach a log
// through an interpolated string.
''')
      ..writeln("import 'package:meta/meta.dart';");

    for (final schema in contract.schemas) {
      buffer.writeln();
      switch (schema) {
        case EnumSchema():
          _writeEnum(buffer, schema);
        case ObjectSchema():
          _writeObject(buffer, schema);
        case UnionSchema():
          _writeUnion(buffer, schema);
      }
    }
    return buffer.toString();
  }

  void _writeEnum(StringBuffer buffer, EnumSchema schema) {
    _writeDoc(buffer, schema.documentation.isEmpty ? 'Contract enumeration.' : schema.documentation);
    buffer.writeln('enum ${schema.name} {');
    for (final entry in schema.values.entries) {
      buffer.writeln("  ${entry.value}('${entry.key}'),");
    }
    buffer
      ..writeln()
      ..writeln('  /// A value this build does not know.')
      ..writeln('  ///')
      ..writeln('  /// The server may add enumeration values at any time; a client that')
      ..writeln('  /// threw on one would break on a deployment it did not ship with.')
      ..writeln("  unknown('');")
      ..writeln()
      ..writeln('  const ${schema.name}(this.wireValue);')
      ..writeln()
      ..writeln('  final String wireValue;')
      ..writeln()
      ..writeln('  /// Parses a wire value, falling back to [unknown].')
      ..writeln('  static ${schema.name} fromWire(String? value) {')
      ..writeln('    for (final candidate in values) {')
      ..writeln('      if (candidate.wireValue == value) {')
      ..writeln('        return candidate;')
      ..writeln('      }')
      ..writeln('    }')
      ..writeln('    return unknown;')
      ..writeln('  }')
      ..writeln()
      ..writeln('  /// The wire value, or null for [unknown].')
      ..writeln('  String? toWire() => this == unknown ? null : wireValue;')
      ..writeln('}');
  }

  void _writeObject(StringBuffer buffer, ObjectSchema schema) {
    _writeDoc(buffer, schema.documentation.isEmpty ? 'Contract object.' : schema.documentation);
    buffer
      ..writeln('@immutable')
      ..writeln('final class ${schema.name} {');
    if (schema.properties.isEmpty) {
      buffer
        ..writeln('  const ${schema.name}();')
        ..writeln()
        ..writeln('  /// Decodes the contract representation.')
        ..writeln('  factory ${schema.name}.fromJson(Map<String, Object?> json) =>')
        ..writeln('      const ${schema.name}();')
        ..writeln();
    } else {
      buffer.writeln('  const ${schema.name}({');
      for (final property in schema.properties) {
        final prefix = property.type.nullable ? '' : 'required ';
        buffer.writeln('    ${prefix}this.${property.dartName},');
      }
      buffer
        ..writeln('  });')
        ..writeln()
        ..writeln('  /// Decodes the contract representation.')
        ..writeln(
          '  factory ${schema.name}.fromJson(Map<String, Object?> json) => ${schema.name}(',
        );
      for (final property in schema.properties) {
        buffer.writeln('        ${property.dartName}: ${_decode(property)},');
      }
      buffer
        ..writeln('      );')
        ..writeln();
    }

    for (final property in schema.properties) {
      if (property.documentation.isNotEmpty) {
        _writeDoc(buffer, property.documentation, indent: '  ');
      }
      buffer
        ..writeln('  final ${property.type.declaration} ${property.dartName};')
        ..writeln();
    }

    buffer.writeln('  /// Encodes the contract representation.');
    buffer.writeln('  Map<String, Object?> toJson() => <String, Object?>{');
    for (final property in schema.properties) {
      buffer.writeln("        '${property.wireName}': ${_encode(property)},");
    }
    buffer
      ..writeln('      };')
      ..writeln()
      ..writeln('  @override')
      ..writeln("  String toString() => '${schema.name}()';")
      ..writeln('}');
  }

  void _writeUnion(StringBuffer buffer, UnionSchema schema) {
    _writeDoc(
      buffer,
      schema.documentation.isEmpty
          ? 'Discriminated union keyed on `${schema.discriminator}`.'
          : schema.documentation,
    );
    buffer
      ..writeln('@immutable')
      ..writeln('sealed class ${schema.name} {')
      ..writeln('  const ${schema.name}();')
      ..writeln()
      ..writeln('  /// Decodes the branch named by `${schema.discriminator}`.')
      ..writeln('  ///')
      ..writeln('  /// An unrecognised discriminator throws [FormatException]: a union the')
      ..writeln('  /// client cannot classify must not be guessed at, and the transport turns')
      ..writeln('  /// the throw into a typed contract-violation failure.')
      ..writeln('  factory ${schema.name}.fromJson(Map<String, Object?> json) {')
      ..writeln("    final discriminator = json['${schema.discriminator}'];")
      ..writeln('    return switch (discriminator) {');
    for (final variant in schema.variants) {
      buffer.writeln(
        "      '${variant.discriminatorValue}' => ${variant.className}.fromJson(json),",
      );
    }
    buffer
      ..writeln('      _ => throw FormatException(')
      ..writeln("          'Unknown ${schema.discriminator} for ${schema.name}.',")
      ..writeln('        ),')
      ..writeln('    };')
      ..writeln('  }')
      ..writeln()
      ..writeln('  /// The raw discriminator value for this branch.')
      ..writeln('  String get ${_camel(schema.discriminator)};')
      ..writeln()
      ..writeln('  /// Encodes this branch, including its discriminator.')
      ..writeln('  Map<String, Object?> toJson();')
      ..writeln('}');

    for (final variant in schema.variants) {
      buffer
        ..writeln()
        ..writeln('/// The `${variant.discriminatorValue}` branch of [${schema.name}].')
        ..writeln('@immutable')
        ..writeln('final class ${variant.className} extends ${schema.name} {');
      if (variant.properties.isEmpty) {
        buffer
          ..writeln('  const ${variant.className}();')
          ..writeln()
          ..writeln('  /// Decodes this branch.')
          ..writeln('  factory ${variant.className}.fromJson(Map<String, Object?> json) =>')
          ..writeln('      const ${variant.className}();')
          ..writeln();
      } else {
        buffer.writeln('  const ${variant.className}({');
        for (final property in variant.properties) {
          final prefix = property.type.nullable ? '' : 'required ';
          buffer.writeln('    ${prefix}this.${property.dartName},');
        }
        buffer
          ..writeln('  });')
          ..writeln()
          ..writeln('  /// Decodes this branch.')
          ..writeln('  factory ${variant.className}.fromJson(Map<String, Object?> json) =>')
          ..writeln('      ${variant.className}(');
        for (final property in variant.properties) {
          buffer.writeln('        ${property.dartName}: ${_decode(property)},');
        }
        buffer
          ..writeln('      );')
          ..writeln();
        for (final property in variant.properties) {
          if (property.documentation.isNotEmpty) {
            _writeDoc(buffer, property.documentation, indent: '  ');
          }
          buffer
            ..writeln('  final ${property.type.declaration} ${property.dartName};')
            ..writeln();
        }
      }
      buffer
        ..writeln('  @override')
        ..writeln("  String get ${_camel(schema.discriminator)} => '${variant.discriminatorValue}';")
        ..writeln()
        ..writeln('  @override')
        ..writeln('  Map<String, Object?> toJson() => <String, Object?>{')
        ..writeln("        '${schema.discriminator}': '${variant.discriminatorValue}',");
      for (final property in variant.properties) {
        buffer.writeln("        '${property.wireName}': ${_encode(property)},");
      }
      buffer
        ..writeln('      };')
        ..writeln()
        ..writeln('  @override')
        ..writeln("  String toString() => '${variant.className}()';")
        ..writeln('}');
    }
  }

  String _decode(PropertyDefinition property) {
    final access = "json['${property.wireName}']";
    return _decodeExpression(property.type, access, nullable: property.type.nullable);
  }

  String _decodeExpression(DartType type, String access, {required bool nullable}) {
    if (type.isList) {
      final item = type.itemType!;
      final element = _decodeExpression(item, 'element', nullable: false);
      final body = '($access! as List<Object?>)\n'
          '            .map((Object? element) => $element)\n'
          '            .toList(growable: false)';
      return nullable ? '$access == null\n            ? null\n            : $body' : body;
    }
    if (type.isEnum) {
      return nullable
          ? '$access == null ? null : ${type.name}.fromWire($access! as String)'
          : '${type.name}.fromWire($access! as String)';
    }
    if (type.isDto) {
      final body = '${type.name}.fromJson($access! as Map<String, Object?>)';
      return nullable ? '$access == null ? null : $body' : body;
    }
    if (type.name == 'DateTime') {
      final body = 'DateTime.parse($access! as String).toUtc()';
      return nullable ? '$access == null ? null : $body' : body;
    }
    return nullable ? '$access as ${type.name}?' : '$access! as ${type.name}';
  }

  String _encode(PropertyDefinition property) =>
      _encodeExpression(property.type, property.dartName, nullable: property.type.nullable);

  String _encodeExpression(DartType type, String access, {required bool nullable}) {
    if (type.isList) {
      final item = type.itemType!;
      final element = _encodeExpression(item, 'element', nullable: false);
      final body = '$access${nullable ? '!' : ''}\n'
          '            .map((${item.declaration} element) => $element)\n'
          '            .toList(growable: false)';
      return nullable ? '$access == null\n            ? null\n            : $body' : body;
    }
    if (type.isEnum) {
      return nullable ? '$access?.toWire()' : '$access.toWire()';
    }
    if (type.isDto) {
      return nullable ? '$access?.toJson()' : '$access.toJson()';
    }
    if (type.name == 'DateTime') {
      return nullable
          ? '$access?.toUtc().toIso8601String()'
          : '$access.toUtc().toIso8601String()';
    }
    return access;
  }

  String emitClient() {
    final buffer = StringBuffer()
      ..writeln(_header('Typed operations for the Karar API.'))
      ..writeln('''
// The client is written against `ApiTransport`, not against an HTTP library.
// Authentication, refresh, retry, correlation and failure mapping all live in
// the transport; this file only knows the contract.
//
// Every method throws `ApiException` carrying a typed `Failure` on any
// non-2xx response or transport error. Repository implementations catch it and
// return `Failed(failure)`.
//
// An operation whose contract documents no response schema returns the decoded
// JSON object as `JsonMap`. That is deliberate: inventing a type for a
// prose-only response would be a claim the contract does not make.
''')
      ..writeln("import '../../utilities/cancellation.dart';")
      ..writeln("import '../api_transport.dart';")
      ..writeln("import '../http_method.dart';")
      ..writeln("import '../timeouts.dart';")
      ..writeln("import 'models.dart';")
      ..writeln()
      ..writeln('/// Typed access to every operation in the contract.')
      ..writeln('final class KararApiClient {')
      ..writeln('  const KararApiClient(this._transport);')
      ..writeln()
      ..writeln('  final ApiTransport _transport;');

    for (final operation in contract.operations) {
      buffer.writeln();
      _writeOperation(buffer, operation);
    }

    buffer.writeln('}');
    return buffer.toString();
  }

  void _writeOperation(StringBuffer buffer, Operation operation) {
    final authenticationNote =
        operation.requiresAuthentication ? ' — requires a session.' : ' — unauthenticated.';
    final signature =
        '`${operation.method.toUpperCase()} ${operation.path}`$authenticationNote';
    final documentation = <String>[
      if (operation.summary.isNotEmpty) operation.summary,
      if (operation.description.isNotEmpty) ...<String>['', operation.description],
      '',
      signature,
    ];
    _writeDoc(buffer, documentation.join('\n'), indent: '  ');

    final returnType = operation.responseType?.declaration ?? 'JsonMap';
    final parameters = <String>[];
    for (final parameter in operation.pathParameters) {
      parameters.add('required ${parameter.type.name} ${parameter.dartName}');
    }
    if (operation.requestType != null) {
      parameters.add(
        operation.requestRequired
            ? 'required ${operation.requestType!.declaration} body'
            : '${operation.requestType!.declaration}? body',
      );
    }
    for (final parameter in operation.queryParameters) {
      parameters.add(
        parameter.required
            ? 'required ${parameter.type.name} ${parameter.dartName}'
            : '${parameter.type.declaration} ${parameter.dartName}',
      );
    }
    if (!operation.isIdempotent) {
      parameters.add('String? idempotencyKey');
    }
    parameters
      ..add('CancellationToken? cancellation')
      ..add('TimeoutProfile timeouts = TimeoutProfile.standard');

    buffer
      ..writeln('  Future<$returnType> ${operation.id}({')
      ..writeAll(parameters.map((String parameter) => '    $parameter,\n'))
      ..writeln('  }) async {')
      ..writeln('    final response = await _transport.send(')
      ..writeln('      ApiRequest(')
      ..writeln('        method: HttpMethod.${operation.method},')
      ..writeln('        path: ${_pathExpression(operation)},');
    if (operation.queryParameters.isNotEmpty) {
      buffer.writeln('        query: <String, Object?>{');
      for (final parameter in operation.queryParameters) {
        buffer.writeln("          '${parameter.name}': ${parameter.dartName},");
      }
      buffer.writeln('        },');
    }
    if (operation.requestType != null) {
      buffer.writeln(
        operation.requestRequired
            ? '        body: body.toJson(),'
            : '        body: body?.toJson(),',
      );
    }
    buffer.writeln('        requiresAuthentication: ${operation.requiresAuthentication},');
    if (!operation.isIdempotent) {
      buffer.writeln('        idempotencyKey: idempotencyKey,');
    }
    buffer
      ..writeln('        cancellation: cancellation,')
      ..writeln('        timeouts: timeouts,')
      ..writeln('      ),')
      ..writeln('    );');

    final responseType = operation.responseType;
    if (responseType == null) {
      buffer.writeln("    return response.requireObject(location: '${operation.id}');");
    } else if (responseType.isList) {
      buffer
        ..writeln("    final decoded = response.requireArray(location: '${operation.id}');")
        ..writeln('    return decoded')
        ..writeln('        .map((Object? element) => '
            '${_decodeExpression(responseType.itemType!, 'element', nullable: false)})')
        ..writeln('        .toList(growable: false);');
    } else {
      buffer.writeln(
        '    return ${responseType.name}.fromJson('
        "response.requireObject(location: '${operation.id}'));",
      );
    }
    buffer.writeln('  }');
  }

  String _pathExpression(Operation operation) {
    if (operation.pathParameters.isEmpty) {
      return "'${operation.path}'";
    }
    var template = operation.path;
    for (final parameter in operation.pathParameters) {
      template = template.replaceAll(
        '{${parameter.name}}',
        '\${Uri.encodeComponent(${parameter.dartName})}',
      );
    }
    return "'$template'";
  }

  void _writeDoc(StringBuffer buffer, String text, {String indent = ''}) {
    for (final line in text.split('\n')) {
      final trimmed = line.trimRight();
      buffer.writeln(trimmed.isEmpty ? '$indent///' : '$indent/// $trimmed');
    }
  }
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

String _pascal(String value) {
  final words = _words(value);
  return words.map(_capitalize).join();
}

/// Dart words that cannot be used as a plain identifier.
///
/// A wire value of `CLASS` or `SWITCH` lowercases to a reserved word and would
/// be emitted as an enum constant, producing a file that does not parse. The
/// analyzer would catch it eventually; naming the offending contract value at
/// generation time is the difference between a one-line fix and a hunt.
///
/// Only the genuinely reserved words are listed — the built-in identifiers
/// (`async`, `await`, `covariant` and friends) are legal as member names.
const Set<String> _dartReservedWords = <String>{
  'assert', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default',
  'do', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'for', 'if',
  'in', 'is', 'new', 'null', 'rethrow', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'var', 'void', 'while', 'with',
  // Not reserved by the language, but every enum the generator emits already
  // declares these, so a wire value matching one collides.
  'index', 'values', 'wireValue', 'toString', 'hashCode', 'runtimeType',
};

String _camel(String value) {
  final pascal = _pascal(value);
  if (pascal.isEmpty) {
    return pascal;
  }
  return pascal[0].toLowerCase() + pascal.substring(1);
}

/// Splits a wire name into words for identifier construction.
///
/// EVERY non-alphanumeric character separates, rather than a fixed list of
/// them. The fixed list was `_ - . ` and space, which is fine until a wire
/// value contains anything else: a media type like `text/markdown` kept its
/// slash all the way into the emitted Dart, producing `text/markdown(...)` as
/// an enum member — uncompilable. The contract is allowed to contain such
/// values, so the generator has to be the side that copes.
///
/// Generalising is strictly safer than extending the list: the four original
/// separators are all non-alphanumeric, so their behaviour is unchanged, and
/// no future value can reintroduce the same failure.
List<String> _words(String value) {
  final buffer = StringBuffer();
  for (var index = 0; index < value.length; index++) {
    final character = value[index];
    final isAlphanumeric = RegExp(r'[A-Za-z0-9]').hasMatch(character);
    if (!isAlphanumeric) {
      buffer.write(' ');
      continue;
    }
    final isUpper = character.toUpperCase() == character && character.toLowerCase() != character;
    final previous = index == 0 ? '' : value[index - 1];
    final previousIsLower =
        previous.isNotEmpty && previous.toLowerCase() == previous && previous.toUpperCase() != previous;
    if (isUpper && previousIsLower) {
      buffer.write(' ');
    }
    buffer.write(character);
  }
  return buffer
      .toString()
      .split(' ')
      .where((String word) => word.isNotEmpty)
      .toList(growable: false);
}

String _capitalize(String word) {
  if (word.isEmpty) {
    return word;
  }
  return word[0].toUpperCase() + word.substring(1).toLowerCase();
}
