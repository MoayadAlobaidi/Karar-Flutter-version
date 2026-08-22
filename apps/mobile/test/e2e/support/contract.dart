// THE CONTRACT, READ AT TEST TIME.
//
// A journey test that scripts HTTP responses is only worth running if those
// responses are ones the server could actually send. A body somebody invented
// from memory passes the test and fails in production, which is worse than no
// test at all — it converts an unknown into a false assurance.
//
// So nothing in this suite writes a response body and hopes. Every scripted
// body is checked, at the moment it is served, against the schema the
// hand-authored OpenAPI document declares for that operation and that status
// code, and every request body the client sends is checked against the schema
// the same document declares for that operation's request. The contract is
// parsed here from `packages/api-contracts/openapi/openapi.yaml` and its
// fragments, with `package:yaml` — already a dev dependency of this package
// because `tool/generate_api_client.dart` reads the same files.
//
// WHY NOT REUSE THE GENERATOR. The generator answers a different question:
// "what Dart types does this contract imply". It deliberately drops everything
// that is not a type — `required`, `additionalProperties: false`, `pattern`,
// `format`, `enum` membership, `minimum` — and those are precisely the
// constraints that catch an invented body. This reads the same files for the
// other half.
//
// THE DIALECT IS THE ONE THE CONTRACT IS WRITTEN IN, not general JSON Schema.
// Path items live in per-module fragments, each fragment carries its own
// `components:` block whose members sit directly under `components`, and a
// `$ref` naming a file is resolved relative to the ROOT document's directory —
// the same three rules `tool/generate_api_client.dart` implements. A `$ref`
// with no file part resolves inside the fragment that wrote it, which is why
// every node carries the document it came from.
//
// Anything this reader does not understand is reported rather than skipped: a
// constraint silently ignored is a check nobody knows they are not getting.
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:yaml/yaml.dart';

/// One node of the contract, together with the document it was read from.
///
/// The document travels with the node because a `$ref` of the form
/// `#/components/AccountType` means "in whichever fragment wrote it". Losing
/// that would resolve a fragment's local component against the root document,
/// where it does not exist.
final class ContractNode {
  const ContractNode(this.document, this.value);

  /// The document key: the empty string for `openapi.yaml`, otherwise the
  /// fragment's path relative to the directory holding it.
  final String document;

  final Object? value;
}

/// The hand-authored OpenAPI contract, resolved on demand.
final class ContractDocument {
  ContractDocument._(this._directory, YamlMap root) {
    _documents[''] = root;
  }

  /// Reads the contract from the first `packages/api-contracts/openapi`
  /// directory at or above the working directory.
  ///
  /// Tests run with `apps/mobile` as the working directory, so the walk is
  /// upwards; the same walk the generator performs.
  factory ContractDocument.load() {
    var directory = Directory.current;
    for (var depth = 0; depth < 8; depth++) {
      final candidate = File(
        p.join(directory.path, 'packages', 'api-contracts', 'openapi', 'openapi.yaml'),
      );
      if (candidate.existsSync()) {
        return ContractDocument._(
          p.dirname(candidate.path),
          loadYaml(candidate.readAsStringSync()) as YamlMap,
        );
      }
      final parent = directory.parent;
      if (parent.path == directory.path) {
        break;
      }
      directory = parent;
    }
    throw StateError(
      'packages/api-contracts/openapi/openapi.yaml was not found above '
      '${Directory.current.path}. The journey suite validates every scripted '
      'body against it and refuses to run without it.',
    );
  }

  final String _directory;
  final Map<String, YamlMap> _documents = <String, YamlMap>{};

  /// Every path template the contract declares, longest first so a more
  /// specific template is matched before a less specific one.
  late final List<String> pathTemplates = () {
    final paths = _documents['']!['paths'];
    if (paths is! YamlMap) {
      throw StateError('openapi.yaml declares no paths.');
    }
    final templates = paths.keys.map((Object? key) => key.toString()).toList()
      ..sort((String a, String b) => b.length.compareTo(a.length));
    return List<String>.unmodifiable(templates);
  }();

  /// The template a concrete request path belongs to, or null when the
  /// contract declares no such path.
  ///
  /// A client that requested a path the contract does not declare is a defect
  /// the journey should fail on, so this answering null is a finding rather
  /// than a lookup miss.
  String? templateFor(String path) {
    final segments = path.split('/');
    for (final template in pathTemplates) {
      final expected = template.split('/');
      if (expected.length != segments.length) {
        continue;
      }
      var matches = true;
      for (var index = 0; index < expected.length; index++) {
        final part = expected[index];
        if (part.startsWith('{') && part.endsWith('}')) {
          if (segments[index].isEmpty) {
            matches = false;
            break;
          }
          continue;
        }
        if (part != segments[index]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return template;
      }
    }
    return null;
  }

  /// The operation object for one template and method.
  ContractNode operation(String template, String method) {
    final paths = _documents['']!['paths']! as YamlMap;
    final raw = paths[template];
    if (raw == null) {
      throw StateError('The contract declares no path $template.');
    }
    final pathItem = resolve(ContractNode('', raw));
    final item = pathItem.value;
    if (item is! YamlMap) {
      throw StateError('The path item for $template is not an object.');
    }
    final operation = item[method.toLowerCase()];
    if (operation == null) {
      throw StateError(
        'The contract declares no ${method.toUpperCase()} on $template.',
      );
    }
    return ContractNode(pathItem.document, operation);
  }

  /// The response schema for one operation and status, or null when the
  /// contract documents that response without a JSON schema.
  ContractNode? responseSchema(
    String template,
    String method,
    int status, {
    String mediaType = 'application/json',
  }) {
    final operation = this.operation(template, method);
    final map = operation.value as YamlMap;
    final responses = map['responses'];
    if (responses is! YamlMap) {
      return null;
    }
    final raw = responses['$status'];
    if (raw == null) {
      throw StateError(
        'The contract documents no $status response for '
        '${method.toUpperCase()} $template. A journey that scripted one would '
        'be asserting against an answer the server never gives.',
      );
    }
    final response = resolve(ContractNode(operation.document, raw));
    return _schemaOf(response, mediaType);
  }

  /// The names of every query parameter the operation declares.
  ///
  /// Read here rather than in the router because a parameter is often a reference
  /// into a shared fragment, and resolving one is this class's job.
  Set<String> queryParameterNames(String template, String method) {
    final operation = this.operation(template, method);
    final map = operation.value;
    if (map is! YamlMap) {
      return const <String>{};
    }
    final parameters = map['parameters'];
    if (parameters is! YamlList) {
      return const <String>{};
    }
    final names = <String>{};
    for (final raw in parameters) {
      final parameter = resolve(ContractNode(operation.document, raw)).value;
      if (parameter is YamlMap && parameter['in'] == 'query') {
        names.add(parameter['name'].toString());
      }
    }
    return names;
  }

  /// The request-body schema for one operation, or null when it declares none.
  ContractNode? requestSchema(
    String template,
    String method, {
    String mediaType = 'application/json',
  }) {
    final operation = this.operation(template, method);
    final map = operation.value as YamlMap;
    final body = map['requestBody'];
    if (body == null) {
      return null;
    }
    return _schemaOf(resolve(ContractNode(operation.document, body)), mediaType);
  }

  ContractNode? _schemaOf(ContractNode holder, String mediaType) {
    final map = holder.value;
    if (map is! YamlMap) {
      return null;
    }
    final content = map['content'];
    if (content is! YamlMap) {
      return null;
    }
    final entry = content[mediaType];
    if (entry is! YamlMap) {
      return null;
    }
    final schema = entry['schema'];
    return schema == null ? null : ContractNode(holder.document, schema);
  }

  /// Follows `$ref` until the node is something other than a reference.
  ContractNode resolve(ContractNode node) {
    var current = node;
    for (var hop = 0; hop < 32; hop++) {
      final value = current.value;
      if (value is! YamlMap) {
        return current;
      }
      final reference = value[r'$ref'];
      if (reference is! String) {
        return current;
      }
      current = _follow(reference, from: current.document);
    }
    throw StateError('A $node reference chain did not terminate.');
  }

  ContractNode _follow(String reference, {required String from}) {
    final parts = reference.split('#');
    final file = parts.first;
    final pointer = parts.length > 1 ? parts[1] : '';
    final key = file.isEmpty ? from : p.normalize(file).replaceAll(r'\', '/');
    return ContractNode(key, _pointer(_documentFor(key), pointer, reference));
  }

  YamlMap _documentFor(String key) {
    final held = _documents[key];
    if (held != null) {
      return held;
    }
    final file = File(p.join(_directory, key));
    if (!file.existsSync()) {
      throw StateError('The contract fragment $key does not exist.');
    }
    final loaded = loadYaml(file.readAsStringSync());
    if (loaded is! YamlMap) {
      throw StateError('The contract fragment $key is not a mapping.');
    }
    _documents[key] = loaded;
    return loaded;
  }

  Object? _pointer(YamlMap document, String pointer, String reference) {
    if (pointer.isEmpty || pointer == '/') {
      return document;
    }
    Object? current = document;
    for (final raw in pointer.split('/').skip(1)) {
      final segment = raw.replaceAll('~1', '/').replaceAll('~0', '~');
      if (current is YamlMap) {
        current = current[segment];
      } else if (current is YamlList) {
        current = current[int.parse(segment)];
      } else {
        current = null;
      }
      if (current == null) {
        throw StateError('Reference $reference does not resolve at "$segment".');
      }
    }
    return current;
  }

  /// Every way [value] fails to satisfy [schemaNode], as sentences naming the
  /// location that drifted.
  ///
  /// An empty list is the only passing answer. The checks implemented are the
  /// ones this contract actually uses: `type` (including the `[T, 'null']`
  /// form), `enum`, `required`, `additionalProperties: false`, `properties`,
  /// `items`, `oneOf`, `pattern`, `minLength`/`maxLength`, `minimum`/`maximum`
  /// and the `date`, `date-time` and `uuid` formats.
  List<String> violations(
    ContractNode schemaNode,
    Object? value, {
    String at = 'body',
  }) {
    final schema = resolve(schemaNode);
    final node = schema.value;
    if (node is! YamlMap) {
      return <String>['$at: the contract node is not a schema object'];
    }

    final oneOf = node['oneOf'];
    if (oneOf is YamlList) {
      final branchFailures = <String>[];
      for (final branch in oneOf) {
        final failures = violations(
          ContractNode(schema.document, branch),
          value,
          at: at,
        );
        if (failures.isEmpty) {
          return const <String>[];
        }
        branchFailures.add(failures.first);
      }
      final alternatives = branchFailures.join(' | ');
      final complaint =
          '$at: matches none of the ${oneOf.length} declared alternatives '
          '($alternatives)';
      return <String>[complaint];
    }

    final failures = <String>[];

    final declaredTypes = _typesOf(node['type']);
    if (declaredTypes.isNotEmpty &&
        !declaredTypes.any((String type) => _isOfType(type, value))) {
      final complaint = '$at: the contract declares '
          '${declaredTypes.join(' or ')} but the value is ${_describe(value)}';
      return <String>[complaint];
    }

    final allowed = node['enum'];
    if (allowed is YamlList) {
      final members = allowed.toList();
      if (!members.any((Object? member) => member == value)) {
        failures.add(
          '$at: ${_render(value)} is not a member of the contract vocabulary '
          '${members.map(_render).join(', ')}',
        );
      }
    }

    if (value is Map) {
      final required = node['required'];
      if (required is YamlList) {
        for (final key in required) {
          if (!value.containsKey(key.toString())) {
            failures.add('$at: required property "$key" is absent');
          }
        }
      }
      final properties = node['properties'];
      if (node['additionalProperties'] == false) {
        for (final key in value.keys) {
          final known = properties is YamlMap && properties.containsKey(key);
          if (!known) {
            failures.add(
              '$at: property "$key" is not declared, and the contract closes '
              'this object',
            );
          }
        }
      }
      if (properties is YamlMap) {
        for (final entry in value.entries) {
          final declared = properties[entry.key];
          if (declared == null) {
            continue;
          }
          failures.addAll(
            violations(
              ContractNode(schema.document, declared),
              entry.value,
              at: '$at.${entry.key}',
            ),
          );
        }
      }
    }

    if (value is List) {
      final items = node['items'];
      if (items != null) {
        for (var index = 0; index < value.length; index++) {
          failures.addAll(
            violations(
              ContractNode(schema.document, items),
              value[index],
              at: '$at[$index]',
            ),
          );
        }
      }
    }

    if (value is String) {
      final pattern = node['pattern'];
      if (pattern is String && !RegExp(pattern).hasMatch(value)) {
        failures.add('$at: does not match the contract pattern $pattern');
      }
      final minLength = node['minLength'];
      if (minLength is int && value.length < minLength) {
        failures.add('$at: is shorter than the contract minimum of $minLength');
      }
      final maxLength = node['maxLength'];
      if (maxLength is int && value.length > maxLength) {
        failures.add('$at: is longer than the contract maximum of $maxLength');
      }
      final format = node['format'];
      if (format is String) {
        final complaint = _formatComplaint(format, value);
        if (complaint != null) {
          failures.add('$at: $complaint');
        }
      }
    }

    if (value is num) {
      final minimum = node['minimum'];
      if (minimum is num && value < minimum) {
        failures.add('$at: is below the contract minimum of $minimum');
      }
      final maximum = node['maximum'];
      if (maximum is num && value > maximum) {
        failures.add('$at: is above the contract maximum of $maximum');
      }
    }

    return failures;
  }

  List<String> _typesOf(Object? declared) {
    if (declared is String) {
      return <String>[declared];
    }
    if (declared is YamlList) {
      return <String>[for (final entry in declared) entry.toString()];
    }
    return const <String>[];
  }

  bool _isOfType(String type, Object? value) => switch (type) {
        'null' => value == null,
        'string' => value is String,
        'integer' => value is int,
        'number' => value is num,
        'boolean' => value is bool,
        'object' => value is Map,
        'array' => value is List,
        _ => throw StateError('The contract declares a type this reader does '
            'not implement: $type'),
      };

  static final RegExp _calendarDay = RegExp(r'^\d{4}-\d{2}-\d{2}$');

  /// An instant with an EXPLICIT offset. The contract says so everywhere it
  /// declares `date-time`, and a body without one would be a moment nobody
  /// can place.
  static final RegExp _instant = RegExp(
    r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$',
  );

  static final RegExp _uuid = RegExp(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
    r'[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  );

  String? _formatComplaint(String format, String value) => switch (format) {
        'date' => _calendarDay.hasMatch(value) && DateTime.tryParse(value) != null
            ? null
            : 'is not a calendar day (format: date), it reads "$value"',
        'date-time' => _instant.hasMatch(value) && DateTime.tryParse(value) != null
            ? null
            : 'is not an instant with an explicit offset (format: date-time), '
                'it reads "$value"',
        'uuid' => _uuid.hasMatch(value)
            ? null
            : 'is not a uuid (format: uuid), it reads "$value"',
        // Every other format the contract uses is decorative for this reader's
        // purpose. Named rather than silently ignored.
        'email' || 'uri' || 'password' || 'byte' || 'binary' => null,
        _ => throw StateError(
            'The contract declares a format this reader does not implement: '
            '$format',
          ),
      };

  String _describe(Object? value) => switch (value) {
        null => 'null',
        String() => 'a string',
        int() => 'an integer',
        double() => 'a number',
        bool() => 'a boolean',
        Map() => 'an object',
        List() => 'an array',
        _ => value.runtimeType.toString(),
      };

  String _render(Object? value) => value is String ? '"$value"' : '$value';
}
