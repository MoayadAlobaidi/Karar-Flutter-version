// THE ONLY THING IN THIS JOURNEY THAT IS NOT REAL.
//
// Everything above the socket is production code: the composition root, the
// providers, the use cases, the repositories, the hand-written mappers, the
// generated `KararApiClient`, the generated DTO decoders and `DioApiTransport`
// with its interceptor stack. This file is the socket — a `ScriptedHttpAdapter`
// wearing a router — and it is deliberately the lowest thing that could be
// substituted. Doubling anything higher would remove from the test exactly the
// disagreements a journey exists to find: a mapper and a repository that each
// work and disagree with each other, a cursor that round-trips wrongly, an
// enumeration that decodes and is written back in the wrong case.
//
// THE ROUTER IS THE CONTRACT'S OWN PATH TABLE. A request is matched against the
// path templates declared in `openapi.yaml`; a path the contract does not
// declare has no route here at all, so a client that invented one fails rather
// than being quietly served.
//
// EVERY BODY IS CHECKED, IN BOTH DIRECTIONS:
//   * a scripted RESPONSE is validated against the schema the contract states
//     for that operation and that status before it is handed to the transport.
//     A body somebody invented — a missing required field, an enumeration
//     member the vocabulary does not contain, an instant where the contract
//     says calendar day, a field that is not declared on a closed object — is
//     a failure of THIS suite, not a passing test;
//   * a REQUEST the client sends is validated against the operation's own
//     request schema, and its query parameters against the operation's
//     declared parameters. That is what catches a value written back in the
//     wrong case, and it is what makes "no operation accepts a userId" a thing
//     the journey observes rather than a thing the contract merely says.
//
// Violations are accumulated rather than thrown. Throwing inside the adapter
// would surface as a transport failure and be mapped to a typed `Failure`,
// which is precisely how a broken fixture would disguise itself as a passing
// error-path assertion. They are asserted empty in a tear-down instead.
import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../core/support/fakes.dart';
import 'contract.dart';

/// One request the client actually issued, as the socket saw it.
final class RecordedRequest {
  RecordedRequest({
    required this.method,
    required this.path,
    required this.uri,
    required this.template,
    required this.query,
    required this.headers,
    required this.contentType,
    required this.jsonBody,
    required this.rawBody,
  });

  final String method;

  /// The concrete path, e.g. `/financial/accounts/{a real id}/balances`.
  final String path;

  /// The full URI as it would go on the wire, percent-encoding included.
  ///
  /// Recorded separately from [query] because the two catch different defects:
  /// a value mangled before Dio sees it shows up in [query], and a value
  /// mangled on the way out shows up here.
  final Uri uri;

  /// The contract template it matched, or null when the contract declares no
  /// such path.
  final String? template;

  final Map<String, Object?> query;
  final Map<String, Object?> headers;
  final String? contentType;

  /// The decoded JSON body, when the client sent one.
  final Object? jsonBody;

  /// The raw bytes, when the client sent a non-JSON body. Held by IDENTITY:
  /// the statement upload must reach the socket as the very object the picker
  /// produced, and `identical` is the only assertion that proves it.
  final Uint8List? rawBody;

  /// The body as a JSON object, for assertions.
  Map<String, Object?> get jsonObject => jsonBody! as Map<String, Object?>;

  @override
  String toString() => '$method $path';
}

/// What a route answers with.
final class ScriptedReply {
  const ScriptedReply(this.status, this.body, {this.mediaType = 'application/json'});

  /// An RFC 7807 problem document, under the media type the platform's single
  /// problem writer emits.
  const ScriptedReply.problem(this.status, this.body)
      : mediaType = 'application/problem+json';

  final int status;
  final Object? body;
  final String mediaType;
}

/// Answers one route. [call] counts from 1, so a route can page.
typedef ScriptedRoute = ScriptedReply Function(RecordedRequest request, int call);

/// A synthetic platform that speaks the contract and nothing else.
final class SyntheticPlatform {
  SyntheticPlatform() : contract = ContractDocument.load() {
    adapter = ScriptedHttpAdapter(_handle);
    // A fixture that drifted from the contract must fail the run rather than
    // be discovered by somebody reading the file later.
    addTearDown(() {
      expect(
        contractViolations,
        isEmpty,
        reason: 'the journey served or observed a payload the contract forbids',
      );
    });
  }

  final ContractDocument contract;

  late final ScriptedHttpAdapter adapter;

  /// Every request the client issued, in order.
  final List<RecordedRequest> requests = <RecordedRequest>[];

  /// Every way a scripted body or an observed request departed from the
  /// contract.
  final List<String> contractViolations = <String>[];

  final Map<String, ScriptedRoute> _routes = <String, ScriptedRoute>{};
  final Map<String, int> _calls = <String, int>{};

  /// Registers the answer for one operation.
  void on(String method, String template, ScriptedRoute route) {
    final key = _key(method, template);
    if (!contract.pathTemplates.contains(template)) {
      throw StateError('The contract declares no path $template.');
    }
    // Proves the operation exists before a test depends on it.
    contract.operation(template, method);
    _routes[key] = route;
  }

  /// A convenience for a route that always answers the same body.
  void answer(String method, String template, int status, Object? body) =>
      on(method, template, (RecordedRequest request, int call) => ScriptedReply(status, body));

  /// Every request issued against one template.
  List<RecordedRequest> requestsFor(String method, String template) => <RecordedRequest>[
        for (final request in requests)
          if (request.method == method.toUpperCase() && request.template == template)
            request,
      ];

  /// The single request issued against one template.
  RecordedRequest requestFor(String method, String template) {
    final matching = requestsFor(method, template);
    expect(
      matching,
      hasLength(1),
      reason: 'expected exactly one ${method.toUpperCase()} $template',
    );
    return matching.single;
  }

  String _key(String method, String template) =>
      '${method.toUpperCase()} $template';

  FutureOr<ResponseBody> _handle(RequestOptions options, int attempt) {
    final method = options.method.toUpperCase();
    final path = Uri.parse(options.path).path;
    final template = contract.templateFor(path);

    final data = options.data;
    final recorded = RecordedRequest(
      method: method,
      path: path,
      uri: options.uri,
      template: template,
      query: Map<String, Object?>.from(options.queryParameters),
      headers: Map<String, Object?>.from(options.headers),
      contentType: options.contentType,
      jsonBody: data is Uint8List ? null : data,
      rawBody: data is Uint8List ? data : null,
    );
    requests.add(recorded);

    if (template == null) {
      contractViolations.add(
        'the client requested $method $path, which the contract does not '
        'declare',
      );
      return jsonResponse(404, <String, Object?>{
        'type': 'about:blank',
        'title': 'Not Found',
        'status': 404,
        'code': 'NOT_FOUND',
      }, contentType: 'application/problem+json');
    }

    _checkRequest(recorded, template, method);

    final route = _routes[_key(method, template)];
    if (route == null) {
      contractViolations.add(
        'the journey issued $method $template, for which no answer was '
        'scripted',
      );
      return jsonResponse(500, <String, Object?>{
        'type': 'about:blank',
        'title': 'Unscripted',
        'status': 500,
        'code': 'STORE_UNAVAILABLE',
      }, contentType: 'application/problem+json');
    }

    final call = (_calls[_key(method, template)] ?? 0) + 1;
    _calls[_key(method, template)] = call;
    final reply = route(recorded, call);
    _checkResponse(reply, template, method);
    return jsonResponse(reply.status, reply.body, contentType: reply.mediaType);
  }

  void _checkRequest(RecordedRequest request, String template, String method) {
    final declared = contract.queryParameterNames(template, method);
    for (final name in request.query.keys) {
      if (!declared.contains(name)) {
        contractViolations.add(
          '$method $template was sent the query parameter "$name", which the '
          'contract does not declare',
        );
      }
    }

    final body = request.jsonBody;
    if (body == null) {
      return;
    }
    final schema = contract.requestSchema(template, method);
    if (schema == null) {
      contractViolations.add(
        '$method $template carried a JSON body, but the contract declares no '
        'application/json request schema for it',
      );
      return;
    }
    contractViolations.addAll(
      contract
          .violations(schema, body, at: 'request $method $template')
          .map((String failure) => 'the client sent a body the contract '
              'refuses — $failure'),
    );
  }

  void _checkResponse(ScriptedReply reply, String template, String method) {
    final schema = contract.responseSchema(
      template,
      method,
      reply.status,
      mediaType: reply.mediaType,
    );
    if (schema == null) {
      if (reply.body != null) {
        contractViolations.add(
          'the journey answered ${reply.status} on $method $template with a '
          'body, but the contract declares no ${reply.mediaType} schema there',
        );
      }
      return;
    }
    contractViolations.addAll(
      contract
          .violations(
            schema,
            reply.body,
            at: '${reply.status} $method $template',
          )
          .map((String failure) => 'the journey served a body the server could '
              'not — $failure'),
    );
  }
}
