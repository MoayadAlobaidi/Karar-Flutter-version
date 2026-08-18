// Test support for the identity workstream.
//
// The harness assembles the REAL composition root and substitutes only the
// two transports. That matters: `SessionManager`, `SecureTokenStore`,
// `SessionTokenCodec`, `TokenRefreshCoordinator`, `AppLockGate` and the
// startup coordinator are the production objects, so a test that says "the
// token reached secure storage" or "exactly one refresh was issued" is
// asserting production behaviour rather than a mock's.
//
// `dioProvider` is never read, so no test opens a socket.
//
// NOTHING HERE FABRICATES FINANCIAL DATA. The fixtures carry identity and
// session state only — no balances, accounts, transactions or amounts.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/configuration/app_configuration.dart';
import 'package:karar_mobile/app/configuration/app_environment.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/core/security/secure_store.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/core/utilities/clock.dart';
import 'package:karar_mobile/core/utilities/correlation_id.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/email_address.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/password.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

/// A scripted answer for one endpoint.
typedef IdentityResponder = Future<ApiResponse> Function(ApiRequest request);

/// An in-memory transport that answers by path.
///
/// Unmatched paths throw a contract violation rather than returning something
/// plausible, so a test that exercises an endpoint it forgot to script fails
/// loudly instead of passing on a fixture nobody wrote.
final class ScriptedIdentityTransport implements ApiTransport {
  ScriptedIdentityTransport();

  final Map<String, IdentityResponder> _routes = <String, IdentityResponder>{};
  final List<ApiRequest> requests = <ApiRequest>[];

  /// Bodies sent, so a test can prove what was and was not transmitted.
  List<Object?> get sentBodies =>
      requests.map((ApiRequest request) => request.body).toList(growable: false);

  int callsTo(String path) =>
      requests.where((ApiRequest request) => request.path == path).length;

  /// Scripts a 2xx JSON object response.
  void onPost(String path, JsonMap body, {int statusCode = 200}) {
    _routes['POST $path'] = (ApiRequest _) async =>
        ApiResponse(statusCode: statusCode, body: body);
  }

  void onGet(String path, JsonMap body, {int statusCode = 200}) {
    _routes['GET $path'] = (ApiRequest _) async =>
        ApiResponse(statusCode: statusCode, body: body);
  }

  void onDelete(String path, JsonMap body, {int statusCode = 200}) {
    _routes['DELETE $path'] = (ApiRequest _) async =>
        ApiResponse(statusCode: statusCode, body: body);
  }

  /// Scripts a typed failure, as the transport would raise it.
  void failWith(HttpMethod method, String path, Failure failure, {int? statusCode}) {
    _routes['${method.wireName} $path'] =
        (ApiRequest _) async => throw ApiException(failure, statusCode: statusCode);
  }

  /// Scripts an arbitrary responder, for delays and call-order assertions.
  void on(HttpMethod method, String path, IdentityResponder responder) {
    _routes['${method.wireName} $path'] = responder;
  }

  @override
  Future<ApiResponse> send(ApiRequest request) {
    requests.add(request);
    final IdentityResponder? responder =
        _routes['${request.method.wireName} ${request.path}'];
    if (responder == null) {
      return Future<ApiResponse>.error(
        ApiException(
          ContractViolationFailure(location: 'unscripted:${request.path}'),
        ),
      );
    }
    return responder(request);
  }
}

/// A session payload as `/auth/login`, `/auth/mfa/challenge` and
/// `/auth/mfa/recovery` return it.
JsonMap sessionPayload({
  String accessToken = 'access-token-fixture',
  String refreshToken = 'refresh-token-fixture',
  String sessionId = '9f1d0f6a-0000-4000-8000-000000000001',
  Duration accessTokenLife = const Duration(minutes: 10),
  Duration refreshTokenLife = const Duration(days: 30),
  DateTime? now,
}) {
  final DateTime issuedAt = (now ?? DateTime.utc(2026, 1, 1)).toUtc();
  return <String, Object?>{
    'status': 'authenticated',
    'accessToken': accessToken,
    'accessTokenExpiresAt': issuedAt.add(accessTokenLife).toIso8601String(),
    'refreshToken': refreshToken,
    'refreshTokenExpiresAt': issuedAt.add(refreshTokenLife).toIso8601String(),
    'sessionId': sessionId,
  };
}

/// A refresh payload, which repeats no session id.
JsonMap refreshPayload({
  String accessToken = 'access-token-rotated',
  String refreshToken = 'refresh-token-rotated',
  DateTime? now,
}) {
  final DateTime issuedAt = (now ?? DateTime.utc(2026, 1, 1)).toUtc();
  return <String, Object?>{
    'status': 'refreshed',
    'accessToken': accessToken,
    'accessTokenExpiresAt': issuedAt.add(const Duration(minutes: 10)).toIso8601String(),
    'refreshToken': refreshToken,
    'refreshTokenExpiresAt': issuedAt.add(const Duration(days: 30)).toIso8601String(),
  };
}

/// A multi-factor challenge payload.
JsonMap mfaChallengePayload({
  String challengeToken = 'challenge-token-fixture',
  DateTime? expiresAt,
  DateTime? now,
}) =>
    <String, Object?>{
      'status': 'mfa_required',
      'challengeToken': challengeToken,
      'challengeExpiresAt': (expiresAt ??
              (now ?? DateTime.utc(2026, 1, 1)).add(const Duration(minutes: 5)))
          .toUtc()
          .toIso8601String(),
    };

/// A session-list payload. Carries device metadata only.
JsonMap sessionListPayload({int others = 1}) => <String, Object?>{
      'sessions': <Object?>[
        <String, Object?>{
          'sessionId': '9f1d0f6a-0000-4000-8000-000000000001',
          'createdAt': DateTime.utc(2026, 1, 1, 9).toIso8601String(),
          'lastSeenAt': DateTime.utc(2026, 1, 2, 9).toIso8601String(),
          'absoluteExpiresAt': DateTime.utc(2026, 2, 1, 9).toIso8601String(),
          'current': true,
          'userAgentSummary': 'iPhone, Karar app',
        },
        for (int index = 0; index < others; index++)
          <String, Object?>{
            'sessionId': '9f1d0f6a-0000-4000-8000-00000000000${index + 2}',
            'createdAt': DateTime.utc(2025, 12, 20, 9).toIso8601String(),
            'lastSeenAt': DateTime.utc(2025, 12, 28, 9).toIso8601String(),
            'current': false,
            'userAgentSummary': 'Android phone, Karar app',
          },
      ],
    };

/// A preference store that records every write.
///
/// Preferences are plain and readable on a rooted or jailbroken device, so the
/// security regression tests need to see everything that reached them — not
/// just the keys a test thought to check.
final class RecordingKeyValueStore implements KeyValueStore {
  RecordingKeyValueStore();

  final InMemoryKeyValueStore _delegate = InMemoryKeyValueStore();

  /// Every key/value pair written, in order, as text.
  final List<String> writes = <String>[];

  /// Everything written, flattened, for containment assertions.
  String get writtenText => writes.join('\n');

  @override
  String? readString(PreferenceKey key) => _delegate.readString(key);

  @override
  Future<void> writeString(PreferenceKey key, String value) {
    writes.add('${key.name}=$value');
    return _delegate.writeString(key, value);
  }

  @override
  bool? readBool(PreferenceKey key) => _delegate.readBool(key);

  @override
  Future<Result<void>> writeBoolChecked(PreferenceKey key, {required bool value}) {
    writes.add('${key.name}=$value');
    return _delegate.writeBoolChecked(key, value: value);
  }

  @override
  Future<void> writeBool(PreferenceKey key, {required bool value}) {
    writes.add('${key.name}=$value');
    return _delegate.writeBool(key, value: value);
  }

  @override
  Future<void> remove(PreferenceKey key) => _delegate.remove(key);

  @override
  Future<void> clear() => _delegate.clear();
}

/// The composition root, wired for a test.
final class IdentityHarness {
  IdentityHarness({
    List<Override> overrides = const <Override>[],
    DateTime? now,
  })  : clock = FixedClock(now ?? DateTime.utc(2026, 1, 1)),
        transport = ScriptedIdentityTransport(),
        refreshTransport = ScriptedIdentityTransport(),
        secureStore = InMemorySecureStore(),
        preferences = RecordingKeyValueStore(),
        logSink = RecordingLogSink() {
    container = ProviderContainer(
      overrides: <Override>[
        configurationResultProvider.overrideWithValue(
          Success<AppConfiguration>(
            AppConfiguration(
              environment: AppEnvironment.local,
              // A loopback host that is never contacted: `dioProvider` is
              // never read, because both transports are substituted.
              apiBaseUrl: Uri.parse('http://localhost:8080'),
              appVersion: '1.0.0',
              buildNumber: '1',
              brandId: 'karar',
            ),
          ),
        ),
        keyValueStoreProvider.overrideWithValue(preferences),
        loggerProvider.overrideWithValue(
          AppLogger(sink: logSink, minimumLevel: LogLevel.trace),
        ),
        secureStoreProvider.overrideWithValue(secureStore),
        clockProvider.overrideWithValue(clock),
        correlationIdGeneratorProvider.overrideWithValue(
          ScriptedCorrelationIdGenerator(<String>[
            '00000000-0000-4000-8000-000000000001',
          ]),
        ),
        apiTransportProvider.overrideWithValue(transport),
        rawApiTransportProvider.overrideWithValue(refreshTransport),
        ...overrides,
      ],
    );
    addTearDown(container.dispose);
  }

  late final ProviderContainer container;

  final FixedClock clock;

  /// The transport every feature call goes through.
  final ScriptedIdentityTransport transport;

  /// The transport the refresh call itself goes through.
  final ScriptedIdentityTransport refreshTransport;

  final InMemorySecureStore secureStore;
  final RecordingKeyValueStore preferences;
  final RecordingLogSink logSink;

  /// Everything written to platform secure storage, for assertions.
  Map<String, String> get secureEntries => secureStore.entries;

  /// Every log line emitted, flattened, for exposure assertions.
  String get loggedText =>
      logSink.records.map((LogRecord record) => record.toString()).join('\n');

  /// Puts a live session in place, as a signed-in launch would.
  Future<SessionTokens> signInFixture({
    String accessToken = 'access-token-fixture',
    String refreshToken = 'refresh-token-fixture',
    Duration accessTokenLife = const Duration(minutes: 10),
  }) async {
    final SessionTokens tokens = SessionTokens(
      accessToken: accessToken,
      accessTokenExpiresAt: clock.nowUtc().add(accessTokenLife),
      refreshToken: refreshToken,
      refreshTokenExpiresAt: clock.nowUtc().add(const Duration(days: 30)),
      sessionId: '9f1d0f6a-0000-4000-8000-000000000001',
    );
    await container.read(sessionManagerProvider).adopt(tokens);
    return tokens;
  }
}

/// Mounts [child] with the identity composition root, the product theme and
/// the product localization delegates.
///
/// Direction is derived from [locale] by the framework rather than passed in,
/// so an Arabic test proves the tree is actually RTL.
Future<void> pumpIdentity(
  WidgetTester tester,
  Widget child, {
  required IdentityHarness harness,
  Locale locale = KararLocalization.english,
  double textScale = 1.0,
  bool settle = true,
}) async {
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: harness.container,
      child: MaterialApp(
        locale: locale,
        localizationsDelegates: KararLocalization.localizationsDelegates,
        supportedLocales: KararLocalization.supportedLocales,
        localeResolutionCallback: KararLocalization.resolve,
        theme: KararTheme.light(locale: locale),
        builder: (BuildContext context, Widget? inner) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(textScale),
          ),
          child: KararThemeScope(child: inner ?? const SizedBox.shrink()),
        ),
        home: child,
      ),
    ),
  );
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
    await tester.pump();
  }
}

/// A well-formed address, for tests that need one and do not care which.
EmailAddress emailFixture([String value = 'person@example.test']) =>
    (EmailAddress.parse(value) as EmailAccepted).email;

/// A password that satisfies the contract's length policy.
Password passwordFixture([String value = 'correct-horse-battery']) =>
    (const PasswordPolicy().parse(value) as PasswordAccepted).password;

/// Finds the button whose visible label is [label].
///
/// A plain text finder is ambiguous on these screens: the app-bar title and
/// the primary action deliberately share wording ("Sign in"), so a test that
/// matched on text alone would either fail or tap the title.
Finder identityButton(String label) => find.widgetWithText(KararButton, label);

/// Scrolls [label]'s button into view and taps it.
///
/// The scroll matters at a 2x text scale, where the submit button of a form is
/// below the fold and an un-scrolled tap would miss it — which is exactly the
/// condition these tests exist to catch.
Future<void> tapIdentityButton(WidgetTester tester, String label) async {
  final Finder button = identityButton(label);
  await tester.ensureVisible(button);
  await tester.pumpAndSettle();
  await tester.tap(button);
}

/// Fills the nth text field on screen.
Future<void> enterIdentityField(
  WidgetTester tester,
  int index,
  String value,
) async {
  await tester.enterText(find.byType(TextField).at(index), value);
}

/// The locales every identity screen is proven in.
const List<Locale> identityLocales = <Locale>[
  KararLocalization.english,
  KararLocalization.arabic,
];

/// Normal, and the largest scale the platform accessibility settings offer.
const List<double> identityTextScales = <double>[1.0, 2.0];

/// Declares one test per shipped locale and text scale.
void testEveryDirectionAndScale(
  String description,
  Future<void> Function(WidgetTester tester, Locale locale, double textScale) body, {
  List<double> textScales = identityTextScales,
}) {
  for (final Locale locale in identityLocales) {
    for (final double scale in textScales) {
      testWidgets('$description [${locale.languageCode} @${scale}x]',
          (WidgetTester tester) async {
        await body(tester, locale, scale);
      });
    }
  }
}
