// THE FINANCIAL REQUESTS, ISSUED THROUGH THE SHARED TRANSPORT.
//
// One place holds every financial path and query key, so a contract change is
// a diff in this file rather than a hunt through four features. The requests
// are byte-for-byte the ones the generated client issues — same paths, same
// query names, same authentication requirement, same timeout profile — because
// the transport port is the same one it is written against. Only the DECODING
// differs, and `financial_wire.dart` says why.
//
// Nothing here logs. A financial path with an account id in it is a record
// locator for one person's money, and the transport already records what it
// needs to under redaction.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/http_method.dart';
import '../../../core/networking/timeouts.dart';

/// Issues the financial requests and hands back decoded JSON objects.
final class FinancialGateway {
  const FinancialGateway(this._transport);

  final ApiTransport _transport;

  /// A GET returning a JSON object.
  Future<JsonMap> get(
    String path, {
    Map<String, Object?> query = const <String, Object?>{},
    required String location,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: HttpMethod.get,
        path: path,
        query: query,
        timeouts: TimeoutProfile.standard,
      ),
    );
    return response.requireObject(location: location);
  }

  Future<JsonMap> send(
    HttpMethod method,
    String path, {
    Object? body,
    required String location,
  }) async {
    final response = await _transport.send(
      ApiRequest(
        method: method,
        path: path,
        body: body,
        timeouts: TimeoutProfile.interactive,
      ),
    );
    return response.requireObject(location: location);
  }
}

/// Runs [operation] and turns every boundary failure into a typed one.
///
/// Three exception shapes are caught, and the last two are the ones a
/// hand-written decoder can raise: a malformed instant is a `FormatException`
/// and a wrongly typed field is a `TypeError`. Both mean the response did not
/// match the contract, which is exactly what a contract violation is.
Future<Result<T>> guarded<T>(
  String location,
  Future<T> Function() operation,
) async {
  try {
    return Success<T>(await operation());
  } on ApiException catch (exception) {
    return Failed<T>(exception.failure);
  } on FormatException {
    return Failed<T>(ContractViolationFailure(location: location));
  } on TypeError {
    return Failed<T>(ContractViolationFailure(location: location));
  }
}

/// Every financial path this client calls.
abstract final class FinancialPaths {
  static const String institutions = '/financial/institutions';
  static const String accounts = '/financial/accounts';
  static const String transactions = '/financial/transactions';
  static const String categories = '/financial/categories';

  static String account(String accountId) => '$accounts/$accountId';
  static String accountBalances(String accountId) => '${account(accountId)}/balances';
  static String accountSourceLinks(String accountId) =>
      '${account(accountId)}/source-links';
  static String accountPaymentInstruments(String accountId) =>
      '${account(accountId)}/payment-instruments';

  static String transaction(String transactionId) => '$transactions/$transactionId';
  static String transactionCategory(String transactionId) =>
      '${transaction(transactionId)}/category';
  static String transactionProvenance(String transactionId) =>
      '${transaction(transactionId)}/provenance';
}
